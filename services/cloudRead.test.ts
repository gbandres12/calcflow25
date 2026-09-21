import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideEmptyCloudRead } from './cloudRead';

describe('leitura da nuvem sem JWT', () => {
  it('sessão ausente e resposta vazia não é empresa zerada', () => {
    assert.equal(
      decideEmptyCloudRead({ isDemo: false, hasAuthUser: false, remoteRowCount: 0 }),
      'keep-local-unauthenticated'
    );
  });

  it('com JWT e linhas no banco usa a nuvem', () => {
    assert.equal(
      decideEmptyCloudRead({ isDemo: false, hasAuthUser: true, remoteRowCount: 57 }),
      'use-remote'
    );
  });

  it('com JWT e zero linhas, preserva local em vez de semear demo', () => {
    assert.equal(
      decideEmptyCloudRead({ isDemo: false, hasAuthUser: true, remoteRowCount: 0 }),
      'empty-authenticated'
    );
  });
});
