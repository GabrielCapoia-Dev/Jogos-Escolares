import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { finalize, retry } from 'rxjs/operators';
import { ApiService, Court, Day, LoginResponse, Match, Period, RealtimeEvent, Sport, Standing, Team } from './api.service';

type PublicView = 'CLASSIFICACAO' | 'CRONOGRAMA' | 'CRONOGRAMA_EQUIPE' | 'RESULTADOS';
type Screen = 'PUBLIC' | 'ADMIN';

@Component({
  selector: 'je-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private touchStartX: number | null = null;
  private publicRefreshTimer = 0;
  private publicRefreshBusy = false;
  private publicRequestVersion = 0;

  private readonly legacyTeams = [
    ['AMARELO', 'Amarelo', '#F3C515', 'Onça', 'mascote-amarelo'],
    ['LARANJA', 'Laranja', '#EF8615', 'Mico-leão-dourado', 'mascote-laranja'],
    ['VERMELHO', 'Vermelho', '#D84247', 'Lobo-guará', 'mascote-vermelho'],
    ['MARROM', 'Marrom', '#986347', 'Capivara', 'mascote-marrom'],
    ['BRANCO', 'Branco', '#F7F7F2', 'Tamanduá', 'mascote-branco'],
    ['PRETO', 'Preto', '#29313B', 'Tucano', 'mascote-preto'],
    ['CINZA', 'Cinza', '#8D9AA6', 'Tubarão', 'mascote-cinza'],
    ['VERDE_CLARO', 'Verde-claro', '#31BD75', 'Sapo', 'mascote-verde-claro'],
    ['VERDE_ESCURO', 'Verde-escuro', '#087D4B', 'Jacaré', 'mascote-verde-escuro'],
    ['AZUL_ESCURO', 'Azul-escuro', '#0753A4', 'Arara-azul', 'mascote-azul-escuro'],
    ['AZUL_CLARO', 'Azul-claro', '#35ACE0', 'Boto', 'mascote-azul-claro']
  ] as const;

  periods: Period[] = [{ id: 'MANHA', name: 'Manhã' }, { id: 'TARDE', name: 'Tarde' }];
  days: Day[] = [{ id: 'DIA_1', name: 'Dia 1' }, { id: 'DIA_2', name: 'Dia 2' }, { id: 'DIA_3', name: 'Dia 3' }];
  courts: Court[] = [{ id: 'QUADRA_1', name: 'Amário Vieira' }, { id: 'QUADRA_2', name: 'Mario Onken' }];
  sports: Sport[] = [];
  teams: Team[] = [];
  standings: Standing[] = [];
  matches: Match[] = [];

  screen: Screen = 'PUBLIC';
  period = '';
  view: PublicView = 'CLASSIFICACAO';
  gender = 'GERAL';
  day = '';
  court = 'QUADRA_1';
  sport = '';
  selectedTeam = '';
  loading = false;
  error = '';
  lastUpdated = '';

  publicFiltersOpen = false;
  loginOpen = false;
  loginEmail = localStorage.getItem('jogos-admin-email') ?? '';
  loginPassword = '';
  rememberLogin = !!localStorage.getItem('jogos-admin-token');
  loginError = '';
  loginLoading = false;
  adminToken = localStorage.getItem('jogos-admin-token') ?? sessionStorage.getItem('jogos-admin-token') ?? '';
  adminMatches: Match[] = [];
  adminStandings: Standing[] = [];
  adminPeriod = 'MANHA';
  adminDay = 'DIA_1';
  adminCourt = 'QUADRA_1';
  adminSport = '';
  adminGender = '';
  adminFiltersOpen = false;
  adminRankingOpen = false;
  correctionOpen = false;
  adminLoading = false;
  toast = '';
  scoreDrafts: Record<string, { a: number; b: number }> = {};
  saveConfirmOpen = false;
  pendingSaveMatch: Match | null = null;
  pendingSaveCorrection = false;
  saveLoading = false;
  saveError = '';

  constructor() {
    this.api.periods().subscribe({ next: value => this.periods = value, error: () => undefined });
    this.api.days().subscribe({ next: value => this.days = value, error: () => undefined });
    this.api.courts().subscribe({ next: value => this.courts = value, error: () => undefined });
    this.api.sports().subscribe({ next: value => this.sports = value, error: () => undefined });
    this.api.events().subscribe({ next: event => this.handleRealtimeEvent(event) });

    // SSE atualiza imediatamente; este ciclo é a rede de segurança para navegadores
    // e proxies que suspendem streams longos (ex.: preview/Codespaces).
    this.publicRefreshTimer = window.setInterval(() => {
      if (this.screen === 'PUBLIC' && this.period && document.visibilityState === 'visible') {
        this.loadPublic(false);
      }
    }, 15000);
  }

  ngOnDestroy(): void {
    window.clearInterval(this.publicRefreshTimer);
  }

  choosePeriod(period: Period): void {
    this.period = period.id;
    this.view = 'CLASSIFICACAO';
    this.day = this.days[0]?.id ?? 'DIA_1';
    this.selectedTeam = sessionStorage.getItem(this.teamFilterKey(period.id)) ?? '';
    this.teams = this.fallbackTeams(period.id);
    this.standings = this.zeroStandings(this.teams);
    void this.loadGeneralDirect(period.id, true);
  }

  backHome(): void {
    this.screen = 'PUBLIC';
    this.period = '';
    this.matches = [];
    this.standings = [];
    this.publicFiltersOpen = false;
    this.loginOpen = false;
    this.closeAdminOverlays();
  }

  setView(view: PublicView): void {
    this.view = view;
    this.publicFiltersOpen = false;
    this.loadPublic();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  loadPublic(showLoading = true, force = false): void {
    if (!this.period) return;
    if (this.publicRefreshBusy && !force) return;

    const requestVersion = ++this.publicRequestVersion;
    this.publicRefreshBusy = true;
    if (showLoading) this.loading = true;
    this.error = '';

    const requestPeriod = this.period;
    const requestView = this.view;
    const requestGender = this.gender;
    const requestDay = this.day;
    const requestCourt = this.court;
    const requestSport = this.sport;

    const complete = () => {
      if (requestVersion === this.publicRequestVersion) this.publicRefreshBusy = false;
    };

    if (requestView === 'CLASSIFICACAO') {
      complete();
      void this.loadGeneralDirect(requestPeriod, showLoading);
      return;
    }

    const day = requestView === 'CRONOGRAMA' || requestView === 'CRONOGRAMA_EQUIPE' ? requestDay : '';
    const court = requestView === 'CRONOGRAMA_EQUIPE' || requestView === 'RESULTADOS' ? '' : requestCourt;
    const gender = requestGender === 'GERAL' ? '' : requestGender;

    forkJoin({
      teams: this.api.teams(requestPeriod).pipe(retry({ count: 1, delay: 300 })),
      matches: this.api.matches(requestPeriod, day, court, requestSport, gender).pipe(retry({ count: 1, delay: 300 }))
    })
      .pipe(finalize(complete))
      .subscribe({
        next: ({ teams, matches }) => {
          if (requestVersion !== this.publicRequestVersion) return;
          if (
            this.period !== requestPeriod ||
            this.view !== requestView ||
            this.day !== requestDay ||
            this.court !== requestCourt ||
            this.sport !== requestSport ||
            this.gender !== requestGender
          ) return;

          this.teams = teams;
          this.matches = requestView === 'RESULTADOS'
            ? matches.filter(item => item.status === 'FINALIZADO')
            : matches;
          this.lastUpdated = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          this.loading = false;
        },
        error: () => {
          if (requestVersion !== this.publicRequestVersion) return;
          this.failPublic();
        }
      });
  }


  applyPublicFilter(kind: 'day' | 'court' | 'sport' | 'gender' | 'team', value: string): void {
    if (kind === 'day') this.day = value;
    if (kind === 'court') {
      this.court = value;
      if (this.sport && !this.sports.some(item => item.id === this.sport && item.courtId === value)) this.sport = '';
    }
    if (kind === 'sport') this.sport = value;
    if (kind === 'gender') this.gender = value;
    if (kind === 'team') {
      this.selectTeam(value);
      return;
    }
    this.loadPublic(true, true);
  }

  confirmPublicFilters(): void {
    this.publicFiltersOpen = false;
    this.loadPublic(true, true);
  }

  selectTeam(value: string): void {
    this.selectedTeam = value;
    const key = this.teamFilterKey();
    if (!key) return;
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  }

  openLogin(): void {
    this.loginError = '';
    if (this.adminToken) {
      this.enterAdmin();
      return;
    }
    this.loginOpen = true;
  }

  login(): void {
    if (!this.loginEmail.trim() || !this.loginPassword) {
      this.loginError = 'Informe o login e a senha.';
      return;
    }
    this.loginLoading = true;
    this.loginError = '';
    this.api.login(this.loginEmail.trim(), this.loginPassword).subscribe({
      next: (response: LoginResponse) => {
        this.adminToken = response.accessToken;
        if (this.rememberLogin) {
          localStorage.setItem('jogos-admin-token', response.accessToken);
          localStorage.setItem('jogos-admin-email', this.loginEmail.trim());
          sessionStorage.removeItem('jogos-admin-token');
        } else {
          sessionStorage.setItem('jogos-admin-token', response.accessToken);
          localStorage.removeItem('jogos-admin-token');
          localStorage.removeItem('jogos-admin-email');
        }
        this.loginPassword = '';
        this.loginLoading = false;
        this.loginOpen = false;
        this.enterAdmin();
      },
      error: error => {
        this.loginLoading = false;
        this.loginError = error?.status === 401
          ? 'Login ou senha inválidos.'
          : 'Não foi possível acessar o servidor. Tente novamente.';
      }
    });
  }

  enterAdmin(): void {
    this.screen = 'ADMIN';
    this.loginOpen = false;
    this.adminPeriod = this.period || 'MANHA';
    this.adminDay = this.days[0]?.id ?? 'DIA_1';
    this.adminCourt = this.courts[0]?.id ?? 'QUADRA_1';
    this.adminSport = '';
    this.adminGender = '';
    void this.loadAdmin();
  }

  logout(): void {
    this.adminToken = '';
    localStorage.removeItem('jogos-admin-token');
    sessionStorage.removeItem('jogos-admin-token');
    this.backHome();
  }

  async loadAdmin(): Promise<void> {
    this.adminLoading = true;
    const period = this.adminPeriod;
    const day = this.adminDay;
    const court = this.adminCourt;
    const sport = this.adminSport;
    const gender = this.adminGender;

    try {
      const state = await this.api.adminStateAsync(period, day, court, sport, gender);
      if (
        this.screen !== 'ADMIN' ||
        this.adminPeriod !== period ||
        this.adminDay !== day ||
        this.adminCourt !== court ||
        this.adminSport !== sport ||
        this.adminGender !== gender
      ) return;

      this.teams = state.teams;
      this.adminStandings = state.standings;
      this.adminMatches = [...state.matches].sort((a, b) => {
        const aFinished = a.status === 'FINALIZADO' ? 1 : 0;
        const bFinished = b.status === 'FINALIZADO' ? 1 : 0;
        return aFinished - bFinished || a.time.localeCompare(b.time) || a.order - b.order;
      });
      for (const item of this.adminMatches) {
        this.scoreDrafts[item.id] = { a: item.scoreA, b: item.scoreB };
      }
    } catch {
      this.showToast('Não foi possível carregar as partidas.');
    } finally {
      this.adminLoading = false;
    }
  }


  setAdminFilter(kind: 'period' | 'day' | 'court' | 'sport' | 'gender', value: string): void {
    if (kind === 'period') this.adminPeriod = value;
    if (kind === 'day') this.adminDay = value;
    if (kind === 'court') {
      this.adminCourt = value;
      if (this.adminSport && !this.sports.some(item => item.id === this.adminSport && item.courtId === value)) this.adminSport = '';
    }
    if (kind === 'sport') this.adminSport = value;
    if (kind === 'gender') this.adminGender = value;
  }

  confirmAdminFilters(): void {
    this.adminFiltersOpen = false;
    void this.loadAdmin();
  }

  adjustScore(match: Match, side: 'A' | 'B', delta: number): void {
    const draft = this.scoreDrafts[match.id] ?? { a: match.scoreA, b: match.scoreB };
    if (side === 'A') draft.a = Math.max(0, draft.a + delta);
    else draft.b = Math.max(0, draft.b + delta);
    this.scoreDrafts[match.id] = { ...draft };
  }

  requestSave(match: Match, correction = false): void {
    this.pendingSaveMatch = match;
    this.pendingSaveCorrection = correction;
    this.saveLoading = false;
    this.saveError = '';
    this.saveConfirmOpen = true;
  }

  cancelSave(): void {
    if (this.saveLoading) return;
    this.saveConfirmOpen = false;
    this.pendingSaveMatch = null;
    this.pendingSaveCorrection = false;
    this.saveError = '';
  }

  async confirmSave(): Promise<void> {
    if (!this.pendingSaveMatch || this.saveLoading) return;
    if (!this.adminToken) {
      this.logout();
      return;
    }

    const match = this.pendingSaveMatch;
    const correction = this.pendingSaveCorrection;
    const draft = this.scoreDrafts[match.id] ?? { a: match.scoreA, b: match.scoreB };

    this.saveLoading = true;
    this.saveError = '';

    try {
      const saved = await this.api.saveResultAsync(match.id, draft.a, draft.b, this.adminToken, correction);
      this.applySavedMatchToAdmin(saved);
      this.saveConfirmOpen = false;
      this.pendingSaveMatch = null;
      this.pendingSaveCorrection = false;
      this.saveError = '';
      this.showToast(correction ? 'Resultado atualizado e registrado.' : 'Resultado salvo com sucesso.');

      // Ranking volta da memória da API; não segura o modal.
      void this.loadAdminRankingOnly();
    } catch (error: any) {
      if (String(error?.message ?? '').includes('401')) {
        this.saveError = 'Sua sessão expirou. Entre novamente.';
      } else {
        this.saveError = correction
          ? 'Não foi possível salvar a correção.'
          : 'Não foi possível salvar o resultado. Tente novamente.';
      }
    } finally {
      this.saveLoading = false;
    }
  }


  private async loadAdminRankingOnly(): Promise<void> {
    try {
      const state = await this.api.adminStateAsync(this.adminPeriod, this.adminDay, this.adminCourt, this.adminSport, this.adminGender);
      this.adminStandings = state.standings;
    } catch {
      // O card já foi atualizado localmente; ranking será sincronizado na próxima ação.
    }
  }

  pendingDraft(): { a: number; b: number } {
    const match = this.pendingSaveMatch;
    if (!match) return { a: 0, b: 0 };
    return this.scoreDrafts[match.id] ?? { a: match.scoreA, b: match.scoreB };
  }

  saveResult(match: Match, correction = false): void {
    if (!this.adminToken) {
      this.logout();
      return;
    }
    const draft = this.scoreDrafts[match.id] ?? { a: match.scoreA, b: match.scoreB };
    this.api.saveResult(match.id, draft.a, draft.b, this.adminToken, correction).subscribe({
      next: saved => {
        this.applySavedMatchToAdmin(saved);
        this.showToast(correction ? 'Resultado atualizado e registrado.' : 'Resultado salvo com sucesso.');
      },
      error: error => {
        if (error?.status === 401) {
          this.showToast('Sua sessão expirou. Entre novamente.');
          this.logout();
          return;
        }
        this.showToast(match.status === 'FINALIZADO' ? 'Use Editar para corrigir um resultado finalizado.' : 'Não foi possível salvar o resultado.');
      }
    });
  }

  exportBackup(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      period: this.adminPeriod,
      day: this.adminDay,
      court: this.adminCourt,
      matches: this.adminMatches
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `placar-jogos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showToast('Backup exportado.');
  }

  closeAdminOverlays(): void {
    this.adminFiltersOpen = false;
    this.adminRankingOpen = false;
    this.correctionOpen = false;
  }

  showToast(message: string): void {
    this.toast = message;
    window.setTimeout(() => { if (this.toast === message) this.toast = ''; }, 2600);
  }

  filteredFinishedMatches(): Match[] {
    return this.adminMatches.filter(item => item.status === 'FINALIZADO');
  }

  currentMatchId(): string {
    return this.adminMatches.find(item => item.status !== 'FINALIZADO' && item.status !== 'CANCELADO')?.id ?? '';
  }

  nextMatchId(): string {
    const pending = this.adminMatches.filter(item => item.status !== 'FINALIZADO' && item.status !== 'CANCELADO');
    return pending[1]?.id ?? '';
  }

  visibleSports(court = this.court): Sport[] {
    return this.sports.filter(item => !court || item.courtId === court);
  }

  adminVisibleSports(): Sport[] {
    return this.sports.filter(item => item.courtId === this.adminCourt);
  }

  resultMatches(): Match[] {
    return this.matches.filter(item => !this.selectedTeam || item.teamAId === this.selectedTeam || item.teamBId === this.selectedTeam);
  }

  latestResults(): Match[] {
    return this.matches.filter(item => item.status === 'FINALIZADO').slice(-6).reverse();
  }

  teamMatches(): Match[] {
    return this.matches
      .filter(item => !this.selectedTeam || item.teamAId === this.selectedTeam || item.teamBId === this.selectedTeam)
      .sort((a, b) => a.time.localeCompare(b.time) || a.order - b.order);
  }

  matchesFor(sport: string, gender: string): Match[] {
    return this.matches.filter(item => item.sportId === sport && item.gender === gender);
  }

  periodName(value = this.period): string { return this.periods.find(item => item.id === value)?.name ?? value; }
  team(id: string): Team | undefined { return this.teams.find(item => item.id === id); }
  sportName(id: string): string { return this.sports.find(item => item.id === id)?.name ?? id; }
  courtName(id: string): string { return this.courts.find(item => item.id === id)?.name ?? id; }
  dayName(id: string): string { return this.days.find(item => item.id === id)?.name ?? id; }
  genderName(value: string): string { return value === 'MASCULINO' ? 'Masculino' : value === 'FEMININO' ? 'Feminino' : 'Geral'; }
  statusLabel(status: string): string { return status === 'FINALIZADO' ? 'Finalizada' : status === 'EM_ANDAMENTO' ? 'Em andamento' : status === 'CANCELADO' ? 'Cancelada' : 'Aguardando'; }
  winner(match: Match, side: 'A' | 'B'): boolean { return side === 'A' ? match.scoreA > match.scoreB : match.scoreB > match.scoreA; }
  resultPoints(match: Match, side: 'A' | 'B'): number {
    if (match.scoreA === match.scoreB) return 1;
    return this.winner(match, side) ? 3 : 0;
  }

  private handleRealtimeEvent(event: RealtimeEvent): void {
    if (this.screen === 'PUBLIC' && this.period === event.period) {
      if (event.type === 'RESULT_UPDATED' && event.match && this.view === 'CLASSIFICACAO') {
        this.upsertPublicFinishedMatch(event.match);
        this.standings = this.calculateLocalStandings(this.teams, this.matches);
        this.lastUpdated = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        this.loading = false;
        this.error = '';
        return;
      }

      if (
        event.type === 'SCOREBOARD_UPDATED' &&
        this.view === 'CLASSIFICACAO' &&
        event.teams &&
        event.standings &&
        event.matches
      ) {
        this.teams = event.teams;
        this.standings = event.standings;
        this.matches = event.matches;
        this.lastUpdated = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        this.loading = false;
        this.error = '';
        return;
      }

      this.loadPublic(false, true);
      return;
    }

    // No admin, a confirmação HTTP já atualiza o card imediatamente.
    // O WebSocket não precisa forçar uma recarga pesada da lista.
  }

  private applySavedMatchToAdmin(saved: Match): void {
    this.scoreDrafts[saved.id] = { a: saved.scoreA, b: saved.scoreB };
    this.adminMatches = this.adminMatches
      .map(item => item.id === saved.id ? { ...item, ...saved } : item)
      .sort((a, b) => {
        const aFinished = a.status === 'FINALIZADO' ? 1 : 0;
        const bFinished = b.status === 'FINALIZADO' ? 1 : 0;
        return aFinished - bFinished || a.time.localeCompare(b.time) || a.order - b.order;
      });
  }

  private upsertPublicFinishedMatch(saved: Match): void {
    const without = this.matches.filter(item => item.id !== saved.id);
    this.matches = [...without, saved];
  }

  private calculateLocalStandings(teams: Team[], matches: Match[]): Standing[] {
    const rows = teams.map((team, index) => ({
      teamId: team.id,
      color: team.color,
      hex: team.hex,
      mascot: team.mascot,
      sprite: team.sprite,
      points: 0,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      position: index + 1
    }));

    const byId = new Map(rows.map(row => [row.teamId, row]));

    for (const match of matches) {
      if (match.status !== 'FINALIZADO') continue;
      if (this.gender !== 'GERAL' && match.gender !== this.gender) continue;

      const a = byId.get(match.teamAId);
      const b = byId.get(match.teamBId);
      if (!a || !b) continue;

      a.games++;
      b.games++;

      if (match.scoreA === match.scoreB) {
        a.draws++;
        b.draws++;
        a.points++;
        b.points++;
      } else if (match.scoreA > match.scoreB) {
        a.wins++;
        b.losses++;
        a.points += 3;
      } else {
        b.wins++;
        a.losses++;
        b.points += 3;
      }
    }

    rows.sort((a, b) => b.points - a.points || b.wins - a.wins || a.color.localeCompare(b.color));
    rows.forEach((row, index) => row.position = index + 1);
    return rows;
  }

  private failPublic(): void {
    this.error = 'Não foi possível carregar os dados.';
    this.loading = false;
  }

  private async loadGeneralDirect(period: string, showLoading = true): Promise<void> {
    if (showLoading) this.loading = true;
    this.error = '';

    try {
      const snapshot = await this.api.snapshotAsync(period, this.gender);
      if (this.screen !== 'PUBLIC' || this.period !== period || this.view !== 'CLASSIFICACAO') return;

      this.teams = snapshot.teams;
      this.standings = snapshot.standings;
      this.matches = snapshot.matches;
      this.lastUpdated = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      this.error = '';
    } catch {
      if (this.screen !== 'PUBLIC' || this.period !== period || this.view !== 'CLASSIFICACAO') return;
      this.error = 'Não foi possível carregar os dados.';
      window.setTimeout(() => {
        if (this.screen === 'PUBLIC' && this.period === period && this.view === 'CLASSIFICACAO') {
          void this.loadGeneralDirect(period, false);
        }
      }, 1500);
    } finally {
      if (this.screen === 'PUBLIC' && this.period === period && this.view === 'CLASSIFICACAO') {
        this.loading = false;
      }
    }
  }

  private loadGeneralFallback(period: string, gender: string, requestVersion: number): void {
    forkJoin({
      teams: this.api.teams(period),
      standings: this.api.standings(period, gender),
      matches: this.api.matches(period)
    }).subscribe({
      next: ({ teams, standings, matches }) => {
        if (requestVersion !== this.publicRequestVersion) return;
        if (this.period !== period || this.view !== 'CLASSIFICACAO') return;
        this.teams = teams;
        this.standings = standings;
        this.matches = matches.filter(item => item.status === 'FINALIZADO');
        this.lastUpdated = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        this.loading = false;
        this.error = '';
      },
      error: () => {
        if (requestVersion !== this.publicRequestVersion) return;
        if (!this.teams.length) this.teams = this.fallbackTeams(period);
        if (!this.standings.length) this.standings = this.zeroStandings(this.teams);
        this.failPublic();
      }
    });
  }

  private teamFilterKey(period = this.period): string {
    return period ? 'jogos-team-filter-' + period : '';
  }

  private fallbackTeams(period: string): Team[] {
    const count = period === 'MANHA' ? 11 : 10;
    return this.legacyTeams.slice(0, count).map(([code, color, hex, mascot, sprite]) => ({
      id: `${period.slice(0, 3)}_${code}`, period, color, hex, mascot, sprite
    }));
  }

  private zeroStandings(teams: Team[]): Standing[] {
    return teams.map((team, index) => ({
      teamId: team.id, color: team.color, hex: team.hex, mascot: team.mascot, sprite: team.sprite,
      points: 0, games: 0, wins: 0, draws: 0, losses: 0, position: index + 1
    }));
  }

  @HostListener('window:touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (window.innerWidth > 699 || this.screen !== 'PUBLIC' || !this.period || this.publicFiltersOpen || this.loginOpen) return;
    this.touchStartX = event.touches[0]?.clientX ?? null;
  }

  @HostListener('window:touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null || window.innerWidth > 699 || this.screen !== 'PUBLIC' || this.publicFiltersOpen || this.loginOpen) return;
    const end = event.changedTouches[0]?.clientX ?? this.touchStartX;
    const delta = end - this.touchStartX;
    this.touchStartX = null;
    if (Math.abs(delta) < 65) return;
    const views: PublicView[] = ['CLASSIFICACAO', 'CRONOGRAMA', 'CRONOGRAMA_EQUIPE', 'RESULTADOS'];
    const index = views.indexOf(this.view);
    const next = views[index + (delta < 0 ? 1 : -1)];
    if (next) this.setView(next);
  }
}
