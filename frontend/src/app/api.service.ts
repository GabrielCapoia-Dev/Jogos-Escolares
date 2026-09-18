import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Period { id: string; name: string; }
export interface Day { id: string; name: string; }
export interface Court { id: string; name: string; }
export interface Sport { id: string; name: string; courtId: string; }
export interface Team { id: string; period: string; color: string; hex: string; mascot: string; }
export interface Match { id: string; period: string; day: string; court: string; time: string; sportId: string; gender: string; teamAId: string; teamBId: string; status: string; scoreA: number; scoreB: number; }
export interface Standing { teamId: string; color: string; hex: string; mascot: string; points: number; games: number; wins: number; draws: number; losses: number; position: number; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1';
  periods(): Observable<Period[]> { return this.http.get<Period[]>(`${this.base}/periods`); }
  days(): Observable<Day[]> { return this.http.get<Day[]>(`${this.base}/days`); }
  courts(): Observable<Court[]> { return this.http.get<Court[]>(`${this.base}/courts`); }
  sports(): Observable<Sport[]> { return this.http.get<Sport[]>(`${this.base}/sports`); }
  teams(period: string): Observable<Team[]> { return this.http.get<Team[]>(`${this.base}/teams`, { params: { period } }); }
  matches(period: string, day = '', court = '', sport = '', gender = ''): Observable<Match[]> {
    let params = new HttpParams().set('period', period);
    if (day) params = params.set('day', day); if (court) params = params.set('court', court); if (sport) params = params.set('sport', sport); if (gender) params = params.set('gender', gender);
    return this.http.get<Match[]>(`${this.base}/matches`, { params });
  }
  standings(period: string, gender: string): Observable<Standing[]> { return this.http.get<Standing[]>(`${this.base}/standings`, { params: { period, gender } }); }
}
