import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalistCutoff, finalistRequired, finalistEligible, initialFinalists } from '../src/app/finalists.ts';

const ranking = positions => positions.map((position, i) => ({ teamId: String(i), position }));

test('preserva primeiro e segundo quando a moeda decide somente a terceira vaga', () => {
  const rows = ranking([1, 2, 3, 3, 3, 6]);
  assert.equal(finalistCutoff(rows), 3);
  assert.deepEqual(initialFinalists(rows), ['0', '1']);
  assert.equal(finalistRequired(rows, '0'), true);
  assert.equal(finalistRequired(rows, '1'), true);
  assert.equal(finalistRequired(rows, '2'), false);
  assert.equal(finalistEligible(rows, '4'), true);
  assert.equal(finalistEligible(rows, '5'), false);
});

test('empate em segundo preserva a primeira e libera duas vagas', () => {
  const rows = ranking([1, 2, 2, 2, 5]);
  assert.equal(finalistCutoff(rows), 2);
  assert.deepEqual(initialFinalists(rows), ['0']);
});

test('empate no primeiro e três vagas exige escolha sem obrigar nenhuma equipe', () => {
  const rows = ranking([1, 1, 1, 1]);
  assert.deepEqual(initialFinalists(rows), []);
  assert(rows.every(row => finalistEligible(rows, row.teamId)));
});

test('três classificados certos são preenchidos automaticamente', () => {
  assert.deepEqual(initialFinalists(ranking([1, 2, 3, 4])), ['0', '1', '2']);
  assert.deepEqual(initialFinalists(ranking([1, 1, 3, 4])), ['0', '1', '2']);
});

test('classificação incompleta não permite escolhas', () => {
  assert.deepEqual(initialFinalists(ranking([1, 2])), []);
  assert.equal(finalistEligible(ranking([1, 2]), '0'), false);
});
