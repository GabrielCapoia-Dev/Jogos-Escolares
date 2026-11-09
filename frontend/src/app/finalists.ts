type RankedTeam = { teamId: string; position: number };

export function finalistCutoff(rows: RankedTeam[]): number {
  return rows.length >= 3 ? rows[2].position : 0;
}

export function finalistRequired(rows: RankedTeam[], id: string): boolean {
  return rows.some(row => row.teamId === id && row.position < finalistCutoff(rows));
}

export function finalistEligible(rows: RankedTeam[], id: string): boolean {
  return rows.some(row => row.teamId === id && row.position <= finalistCutoff(rows));
}

export function initialFinalists(rows: RankedTeam[]): string[] {
  const eligible = rows.filter(row => finalistEligible(rows, row.teamId));
  return (eligible.length === 3 ? eligible : rows.filter(row => finalistRequired(rows, row.teamId)))
    .map(row => row.teamId);
}
