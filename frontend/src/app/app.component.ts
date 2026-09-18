import { CommonModule } from '@angular/common';
import { Component, HostListener, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Court, Day, LoginResponse, Match, Period, Sport, Standing, Team } from './api.service';

type PublicView = 'CLASSIFICACAO' | 'CRONOGRAMA' | 'CRONOGRAMA_EQUIPE' | 'RESULTADOS';
type Screen = 'PUBLIC' | 'ADMIN';

@Component({
  selector: 'je-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent {
  private readonly api = inject(ApiService);
  private touchStartX: number | null = null;

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

  constructor() {
    this.api.periods().subscribe({ next: value => this.periods = value, error: () => undefined });
    this.api.days().subscribe({ next: value => this.days = value, error: () => undefined });
    this.api.courts().subscribe({ next: value => this.courts = value, error: () => undefined });
    this.api.sports().subscribe({ next: value => this.sports = value, error: () => undefined });
  }

  choosePeriod(period: Period): void {
    this.period = period.id;
    this.view = 'CLASSIFICACAO';
    this.day = this.days[0]?.id ?? 'DIA_1';
    this.teams = this.fallbackTeams(period.id);
    this.standings = this.zeroStandings(this.teams);
    this.loadPublic();
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
    this.selectedTeam = '';
    this.publicFiltersOpen = false;
    this.loadPublic();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  loadPublic(): void {
    if (!this.period) return;
    this.loading = true;
    this.error = '';
    this.lastUpdated = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.api.teams(this.period).subscribe({
      next: teams => this.teams = teams,
      error: () => this.teams = this.fallbackTeams(this.period)
    });
    if (this.view === 'CLASSIFICACAO') {
      this.api.standings(this.period, this.gender).subscribe({
        next: value => { this.standings = value; this.loading = false; },
        error: () => { this.standings = this.zeroStandings(this.teams); this.failPublic(); }
      });
      this.api.matches(this.period).subscribe({
        next: value => this.matches = value.filter(item => item.status === 'FINALIZADO'),
        error: () => this.matches = []
      });
      return;
    }
    const day = this.view === 'CRONOGRAMA' || this.view === 'CRONOGRAMA_EQUIPE' ? this.day : '';
    const court = this.view === 'CRONOGRAMA_EQUIPE' || this.view === 'RESULTADOS' ? '' : this.court;
    const gender = this.gender === 'GERAL' ? '' : this.gender;
    this.api.matches(this.period, day, court, this.sport, gender).subscribe({
      next: value => {
        this.matches = this.view === 'RESULTADOS' ? value.filter(item => item.status === 'FINALIZADO') : value;
        this.loading = false;
      },
      error: () => this.failPublic()
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
    if (kind === 'team') this.selectedTeam = value;
  }

  confirmPublicFilters(): void {
    this.publicFiltersOpen = false;
    this.loadPublic();
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
      error: () => {
        this.loginLoading = false;
        this.loginError = 'Login ou senha inválidos.';
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
    this.loadAdmin();
  }

  logout(): void {
    this.adminToken = '';
    localStorage.removeItem('jogos-admin-token');
    sessionStorage.removeItem('jogos-admin-token');
    this.backHome();
  }

  loadAdmin(): void {
    this.adminLoading = true;
    this.api.teams(this.adminPeriod).subscribe({ next: value => this.teams = value, error: () => undefined });
    this.api.standings(this.adminPeriod, 'GERAL').subscribe({ next: value => this.adminStandings = value, error: () => this.adminStandings = [] });
    this.api.matches(this.adminPeriod, this.adminDay, this.adminCourt, this.adminSport, this.adminGender).subscribe({
      next: value => {
        this.adminMatches = value;
        for (const item of value) {
          this.scoreDrafts[item.id] = { a: item.scoreA, b: item.scoreB };
        }
        this.adminLoading = false;
      },
      error: () => {
        this.adminLoading = false;
        this.showToast('Não foi possível carregar as partidas.');
      }
    });
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
    this.loadAdmin();
  }

  adjustScore(match: Match, side: 'A' | 'B', delta: number): void {
    const draft = this.scoreDrafts[match.id] ?? { a: match.scoreA, b: match.scoreB };
    if (side === 'A') draft.a = Math.max(0, draft.a + delta);
    else draft.b = Math.max(0, draft.b + delta);
    this.scoreDrafts[match.id] = { ...draft };
  }

  saveResult(match: Match, correction = false): void {
    if (!this.adminToken) {
      this.logout();
      return;
    }
    const draft = this.scoreDrafts[match.id] ?? { a: match.scoreA, b: match.scoreB };
    this.api.saveResult(match.id, draft.a, draft.b, this.adminToken, correction).subscribe({
      next: () => {
        this.showToast(correction ? 'Resultado atualizado e registrado.' : 'Resultado salvo com sucesso.');
        this.loadAdmin();
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

  private failPublic(): void {
    this.error = 'Não foi possível carregar os dados.';
    this.loading = false;
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
