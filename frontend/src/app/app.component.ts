import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Court, Day, Match, Period, Sport, Standing, Team } from './api.service';

type View = 'CLASSIFICACAO' | 'CRONOGRAMA' | 'CRONOGRAMA_EQUIPE' | 'RESULTADOS';

@Component({ selector: 'je-root', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './app.component.html' })
export class AppComponent {
  private readonly api = inject(ApiService);
  periods: Period[] = []; days: Day[] = []; courts: Court[] = []; sports: Sport[] = []; teams: Team[] = [];
  standings: Standing[] = []; matches: Match[] = []; period = ''; view: View = 'CLASSIFICACAO'; gender = 'GERAL'; day = ''; court = 'QUADRA_1'; sport = ''; selectedTeam = ''; loading = false; error = ''; lastUpdated = '';

  constructor() { this.api.periods().subscribe({ next: periods => this.periods = periods, error: () => this.error = 'Não foi possível carregar os períodos.' }); this.api.days().subscribe(days => this.days = days); this.api.courts().subscribe(courts => this.courts = courts); this.api.sports().subscribe(sports => this.sports = sports); }
  choosePeriod(period: Period): void { this.period = period.id; this.view = 'CLASSIFICACAO'; this.day = this.days[0]?.id ?? ''; this.load(); }
  backHome(): void { this.period = ''; this.matches = []; this.standings = []; }
  setView(view: View): void { this.view = view; this.selectedTeam = ''; this.load(); }
  load(): void {
    if (!this.period) return; this.loading = true; this.error = ''; this.lastUpdated = new Date().toLocaleTimeString('pt-BR');
    this.api.teams(this.period).subscribe(teams => this.teams = teams);
    if (this.view === 'CLASSIFICACAO') { this.api.standings(this.period, this.gender).subscribe({ next: value => { this.standings = value; this.loading = false; }, error: () => this.fail() }); return; }
    const day = this.view === 'CRONOGRAMA_EQUIPE' || this.view === 'CRONOGRAMA' ? this.day : '';
    this.api.matches(this.period, day, this.view === 'CRONOGRAMA_EQUIPE' ? '' : this.court, this.sport, this.gender === 'GERAL' ? '' : this.gender).subscribe({ next: value => { this.matches = this.view === 'RESULTADOS' ? value.filter(match => match.status === 'FINALIZADO') : value; this.loading = false; }, error: () => this.fail() });
  }
  private fail(): void { this.error = 'Não foi possível carregar os dados.'; this.loading = false; }
  periodName(): string { return this.periods.find(item => item.id === this.period)?.name ?? ''; }
  team(id: string): Team | undefined { return this.teams.find(item => item.id === id); }
  sportName(id: string): string { return this.sports.find(item => item.id === id)?.name ?? id; }
  courtName(id: string): string { return this.courts.find(item => item.id === id)?.name ?? id; }
  dayName(id: string): string { return this.days.find(item => item.id === id)?.name ?? id; }
  genderName(value: string): string { return value === 'MASCULINO' ? 'Masculino' : 'Feminino'; }
  statusLabel(status: string): string { return status === 'FINALIZADO' ? 'Finalizada' : status === 'EM_ANDAMENTO' ? 'Em andamento' : 'Aguardando'; }
  resultMatches(): Match[] { return this.matches.filter(match => !this.selectedTeam || match.teamAId === this.selectedTeam || match.teamBId === this.selectedTeam); }
  teamMatches(): Match[] { return this.matches.filter(match => !this.selectedTeam || match.teamAId === this.selectedTeam || match.teamBId === this.selectedTeam).sort((a,b) => a.time.localeCompare(b.time) || a.order - b.order); }
  matchesFor(sport: string, gender: string): Match[] { return this.matches.filter(match => match.sportId === sport && match.gender === gender); }
  winner(match: Match, side: 'A' | 'B'): boolean { return side === 'A' ? match.scoreA > match.scoreB : match.scoreB > match.scoreA; }
}
