import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Court, Day, Match, Period, Sport, Standing, Team } from './api.service';

type View = 'CLASSIFICACAO' | 'CRONOGRAMA' | 'RESULTADOS';

@Component({ selector: 'je-root', standalone: true, imports: [CommonModule, FormsModule], templateUrl: './app.component.html' })
export class AppComponent {
  private readonly api = inject(ApiService);
  periods: Period[] = []; days: Day[] = []; courts: Court[] = []; sports: Sport[] = []; teams: Team[] = [];
  standings: Standing[] = []; matches: Match[] = []; period = ''; view: View = 'CLASSIFICACAO'; gender = 'GERAL'; day = ''; court = ''; sport = ''; loading = false; error = '';
  constructor() { this.api.periods().subscribe({ next: periods => this.periods = periods, error: () => this.error = 'Não foi possível carregar os períodos.' }); this.api.days().subscribe(days => this.days = days); this.api.courts().subscribe(courts => this.courts = courts); this.api.sports().subscribe(sports => this.sports = sports); }
  choosePeriod(period: Period): void { this.period = period.id; this.view = 'CLASSIFICACAO'; this.day = this.days[0]?.id ?? ''; this.load(); }
  backHome(): void { this.period = ''; this.matches = []; this.standings = []; }
  setView(view: View): void { this.view = view; this.load(); }
  load(): void { if (!this.period) return; this.loading = true; this.error = ''; this.api.teams(this.period).subscribe(teams => this.teams = teams); if (this.view === 'CLASSIFICACAO') { this.api.standings(this.period, this.gender).subscribe({ next: value => { this.standings = value; this.loading = false; }, error: () => { this.error = 'Não foi possível carregar a classificação.'; this.loading = false; } }); } else { this.api.matches(this.period, this.view === 'CRONOGRAMA' ? this.day : '', this.court, this.sport, this.gender === 'GERAL' ? '' : this.gender).subscribe({ next: value => { this.matches = this.view === 'RESULTADOS' ? value.filter(match => match.status === 'FINALIZADO') : value; this.loading = false; }, error: () => { this.error = 'Não foi possível carregar as partidas.'; this.loading = false; } }); } }
  team(id: string): Team | undefined { return this.teams.find(item => item.id === id); }
  periodName(): string { return this.periods.find(item => item.id === this.period)?.name ?? ''; }
  sportName(id: string): string { return this.sports.find(item => item.id === id)?.name ?? id; }
  courtName(id: string): string { return this.courts.find(item => item.id === id)?.name ?? id; }
  statusLabel(status: string): string { return status === 'FINALIZADO' ? 'Finalizado' : status === 'EM_ANDAMENTO' ? 'Em andamento' : 'Aguardando'; }
}
