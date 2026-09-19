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
export interface RealtimeEvent { type: 'RESULT_UPDATED' | 'SCOREBOARD_UPDATED'; period: string; match?: Match; matchId?: string; day?: string; court?: string; sportId?: string; gender?: string; scoreA?: number; scoreB?: number; status?: string; teams?: Team[]; standings?: Standing[]; matches?: Match[]; updatedAt?: string; }
export interface PublicSnapshot { teams: Team[]; standings: Standing[]; matches: Match[]; updatedAt: string; }
export interface AdminState { teams: Team[]; standings: Standing[]; matches: Match[]; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1';

  private async fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init.headers ?? {})
        }
      });
      if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `HTTP ${response.status}`);
      }
      return await response.json() as T;
    } finally {
      window.clearTimeout(timer);
    }
  }

  snapshotAsync(period: string, gender: string): Promise<PublicSnapshot> {
    const params = new URLSearchParams({ period, gender, _t: String(Date.now()) });
    return this.fetchJson<PublicSnapshot>(`${this.base}/snapshot?${params.toString()}`, {}, 10000);
  }

  adminStateAsync(period: string, day: string, court: string, sport = '', gender = ''): Promise<AdminState> {
    const params = new URLSearchParams({ period, day, court, _t: String(Date.now()) });
    if (sport) params.set('sport', sport);
    if (gender) params.set('gender', gender);
    return this.fetchJson<AdminState>(`${this.base}/admin-state?${params.toString()}`, {}, 10000);
  }

  saveResultAsync(id: string, scoreA: number, scoreB: number, token: string, correction = false): Promise<Match> {
    return this.fetchJson<Match>(
      `${this.base}/admin/matches/${encodeURIComponent(id)}/result`,
      {
        method: correction ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ scoreA, scoreB })
      },
      8000
    );
  }

  periods(): Observable<Period[]> { return this.http.get<Period[]>(`${this.base}/periods`); }
  days(): Observable<Day[]> { return this.http.get<Day[]>(`${this.base}/days`); }
  courts(): Observable<Court[]> { return this.http.get<Court[]>(`${this.base}/courts`); }
  sports(): Observable<Sport[]> { return this.http.get<Sport[]>(`${this.base}/sports`); }
  teams(period: string): Observable<Team[]> { return this.http.get<Team[]>(`${this.base}/teams`, { params: { period } }).pipe(timeout(12000)); }

  matches(period: string, day = '', court = '', sport = '', gender = ''): Observable<Match[]> {
    let params = new HttpParams().set('period', period);
    if (day) params = params.set('day', day);
    if (court) params = params.set('court', court);
    if (sport) params = params.set('sport', sport);
    if (gender) params = params.set('gender', gender);
    return this.http.get<Match[]>(`${this.base}/matches`, { params }).pipe(timeout(12000));
  }

  standings(period: string, gender: string): Observable<Standing[]> {
    return this.http.get<Standing[]>(`${this.base}/standings`, { params: { period, gender } }).pipe(timeout(12000));
  }

  snapshot(period: string, gender: string): Observable<PublicSnapshot> {
    return this.http.get<PublicSnapshot>(`${this.base}/snapshot`, { params: { period, gender } }).pipe(timeout(15000));
  }
  adminState(period: string, day: string, court: string, sport = '', gender = ''): Observable<AdminState> {
    let params = new HttpParams().set('period', period).set('day', day).set('court', court);
    if (sport) params = params.set('sport', sport);
    if (gender) params = params.set('gender', gender);
    return this.http.get<AdminState>(`${this.base}/admin-state`, { params }).pipe(timeout(12000));
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/auth/login`, { email, password }).pipe(timeout(8000));
  }

  events(): Observable<RealtimeEvent> {
    return new Observable<RealtimeEvent>(subscriber => {
      let socket: WebSocket | null = null;
      let reconnectTimer = 0;
      let closedByClient = false;

      const connect = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${window.location.host}${this.base}/ws`);

        socket.onmessage = message => {
          try {
            const event = JSON.parse(String(message.data)) as { type?: string } & Partial<RealtimeEvent>;
            if (event.type === 'RESULT_UPDATED' || event.type === 'SCOREBOARD_UPDATED') subscriber.next(event as RealtimeEvent);
          } catch {
            // Mensagens de heartbeat/controle não alteram a interface.
          }
        };

        socket.onclose = () => {
          if (closedByClient) return;
          reconnectTimer = window.setTimeout(connect, 1000);
        };

        socket.onerror = () => {
          try { socket?.close(); } catch { /* noop */ }
        };
      };

      connect();

      return () => {
        closedByClient = true;
        window.clearTimeout(reconnectTimer);
        try { socket?.close(); } catch { /* noop */ }
      };
    });
  }

  saveResult(id: string, scoreA: number, scoreB: number, token: string, correction = false): Observable<Match> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const url = `${this.base}/admin/matches/${encodeURIComponent(id)}/result`;
    const body = { scoreA, scoreB };
    return (correction
      ? this.http.put<Match>(url, body, { headers })
      : this.http.post<Match>(url, body, { headers })
     ).pipe(timeout(8000));
  }
}
