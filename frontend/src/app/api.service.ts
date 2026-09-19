import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { timeout } from 'rxjs/operators';

export interface Period { id: string; name: string; }
export interface Day { id: string; name: string; }
export interface Court { id: string; name: string; }
export interface Sport { id: string; name: string; courtId: string; }
export interface Team { id: string; period: string; color: string; hex: string; mascot: string; sprite: string; }
export interface Match { id: string; period: string; day: string; court: string; time: string; sportId: string; gender: string; teamAId: string; teamBId: string; status: string; order: number; scoreA: number; scoreB: number; }
export interface Standing { teamId: string; color: string; hex: string; mascot: string; sprite: string; points: number; games: number; wins: number; draws: number; losses: number; position: number; }
export interface LoginResponse { accessToken: string; tokenType: string; expiresIn: string; }
export interface RealtimeEvent { type: 'RESULT_UPDATED'; matchId: string; period: string; day: string; court: string; sportId: string; gender: string; scoreA: number; scoreB: number; status: string; }
export interface PublicSnapshot { teams: Team[]; standings: Standing[]; matches: Match[]; updatedAt: string; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1';

  periods(): Observable<Period[]> { return this.http.get<Period[]>(`${this.base}/periods`); }
  days(): Observable<Day[]> { return this.http.get<Day[]>(`${this.base}/days`); }
  courts(): Observable<Court[]> { return this.http.get<Court[]>(`${this.base}/courts`); }
  sports(): Observable<Sport[]> { return this.http.get<Sport[]>(`${this.base}/sports`); }
  teams(period: string): Observable<Team[]> { return this.http.get<Team[]>(`${this.base}/teams`, { params: { period } }).pipe(timeout(4000)); }

  matches(period: string, day = '', court = '', sport = '', gender = ''): Observable<Match[]> {
    let params = new HttpParams().set('period', period);
    if (day) params = params.set('day', day);
    if (court) params = params.set('court', court);
    if (sport) params = params.set('sport', sport);
    if (gender) params = params.set('gender', gender);
    return this.http.get<Match[]>(`${this.base}/matches`, { params }).pipe(timeout(4000));
  }

  standings(period: string, gender: string): Observable<Standing[]> {
    return this.http.get<Standing[]>(`${this.base}/standings`, { params: { period, gender } }).pipe(timeout(4000));
  }

  snapshot(period: string, gender: string): Observable<PublicSnapshot> {
    return this.http.get<PublicSnapshot>(`${this.base}/snapshot`, { params: { period, gender } }).pipe(timeout(15000));
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, { email, password }).pipe(timeout(8000));
  }

  events(): Observable<RealtimeEvent> {
    return new Observable<RealtimeEvent>(subscriber => {
      const source = new EventSource(`${this.base}/events`);
      source.onmessage = event => {
        try {
          subscriber.next(JSON.parse(event.data) as RealtimeEvent);
        } catch {
          // Ignora mensagens inválidas; o stream continua conectado.
        }
      };
      return () => source.close();
    });
  }

  saveResult(id: string, scoreA: number, scoreB: number, token: string, correction = false): Observable<Match> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const url = `${this.base}/admin/matches/${encodeURIComponent(id)}/result`;
    const body = { scoreA, scoreB };
    return correction
      ? this.http.put<Match>(url, body, { headers })
      : this.http.post<Match>(url, body, { headers });
  }
}
