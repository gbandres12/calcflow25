import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getViewPath, getViewTitle, parseViewFromLocation, ROUTES } from './routes';
import { dateISOBR, getDatePresetRange, getLocalDateStr } from '../utils/dateFilterUtils';

describe('roteamento e sincronização de URL', () => {
  it('converte Views operacionais nos caminhos oficiais em português', () => {
    assert.equal(getViewPath('dashboard'), '/dashboard');
    assert.equal(getViewPath('customers'), '/clientes');
    assert.equal(getViewPath('orders'), '/vendas');
    assert.equal(getViewPath('fiscal'), '/fiscal');
    assert.equal(getViewPath('fiscal_config'), '/config-nfe');
    assert.equal(getViewPath('daily'), '/caixa');
    assert.equal(getViewPath('transactions'), '/lancamentos');
    assert.equal(getViewPath('accounts'), '/contas');
    assert.equal(getViewPath('inventory'), '/produtos');
    assert.equal(getViewPath('milling'), '/moagem');
    assert.equal(getViewPath('yard'), '/patio');
    assert.equal(getViewPath('transfers'), '/transferencias');
  });

  it('gera títulos amigáveis para cada tela do sistema', () => {
    assert.match(getViewTitle('dashboard'), /Visão Geral/);
    assert.match(getViewTitle('customers'), /Clientes & Fornecedores/);
    assert.match(getViewTitle('fiscal'), /Notas Fiscais/);
  });

  it('interpreta caminhos, aliases e rotas com barra no final', () => {
    const originalWindow = (globalThis as any).window;

    try {
      (globalThis as any).window = { location: { pathname: '/clientes', hash: '' } };
      assert.equal(parseViewFromLocation(), 'customers');

      (globalThis as any).window = { location: { pathname: '/fornecedores/', hash: '' } };
      assert.equal(parseViewFromLocation(), 'customers');

      (globalThis as any).window = { location: { pathname: '/vendas', hash: '' } };
      assert.equal(parseViewFromLocation(), 'orders');

      (globalThis as any).window = { location: { pathname: '/pedidos', hash: '' } };
      assert.equal(parseViewFromLocation(), 'orders');

      (globalThis as any).window = { location: { pathname: '/fiscal', hash: '' } };
      assert.equal(parseViewFromLocation(), 'fiscal');

      (globalThis as any).window = { location: { pathname: '/notas-fiscais', hash: '' } };
      assert.equal(parseViewFromLocation(), 'fiscal');

      (globalThis as any).window = { location: { pathname: '/caixa', hash: '' } };
      assert.equal(parseViewFromLocation(), 'daily');

      (globalThis as any).window = { location: { pathname: '/contas', hash: '' } };
      assert.equal(parseViewFromLocation(), 'accounts');

      (globalThis as any).window = { location: { pathname: '/', hash: '' } };
      assert.equal(parseViewFromLocation(), 'dashboard');

      // Suporte a hash fallback se o usuário abrir com #/fiscal
      (globalThis as any).window = { location: { pathname: '/', hash: '#/fiscal' } };
      assert.equal(parseViewFromLocation(), 'fiscal');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});

describe('precisão de fuso horário brasileiro (America/Sao_Paulo)', () => {
  it('não vira o dia depois das 21h do Brasil (quando em UTC já é o dia seguinte)', () => {
    // 22:30 em Brasília (UTC-3) do dia 2026-10-09 equivale a 01:30 UTC do dia 2026-10-10
    const lateNightBRT = new Date('2026-10-10T01:30:00Z');

    assert.equal(lateNightBRT.toISOString().slice(0, 10), '2026-10-10', 'Em UTC já é o dia 10');
    assert.equal(dateISOBR(lateNightBRT), '2026-10-09', 'Em Brasília ainda é o dia 09');
    assert.equal(getLocalDateStr(lateNightBRT), '2026-10-09', 'getLocalDateStr deve respeitar Brasília');
  });

  it('calcula preset THIS_MONTH baseado no fuso horário do Brasil', () => {
    const range = getDatePresetRange('THIS_MONTH');
    assert.ok(range.startDate.endsWith('-01'));
    assert.ok(range.endDate.length === 10);
  });
});
