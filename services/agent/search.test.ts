import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickUnique, rankNamed, scoreName } from './search';

describe('agente: casar nome digitado no Telegram com o cadastro', () => {
  it('GABRIEL ANDRES encontra Gabriel Lima Andres', () => {
    assert.ok(scoreName('GABRIEL ANDRES', 'Gabriel Lima Andres') >= 70);
    const ranked = rankNamed(
      [{ name: 'Gabriel Lima Andres' }, { name: 'Fazenda Boa Vista' }],
      'GABRIEL ANDRES',
      (item) => item.name
    );
    assert.equal(pickUnique(ranked)?.name, 'Gabriel Lima Andres');
  });

  it('o nome completo também acha o cadastro mais curto', () => {
    assert.ok(scoreName('Gabriel Lima Andres', 'GABRIEL ANDRES') >= 60);
  });

  it('não mistura dois clientes só porque compartilham o primeiro nome', () => {
    const ranked = rankNamed(
      [{ name: 'Gabriel Lima Andres' }, { name: 'Gabriel Silva Souza' }],
      'Gabriel',
      (item) => item.name
    );
    assert.equal(pickUnique(ranked), null);
  });

  it('calcário dolomítico casa com o único calcário do estoque', () => {
    const ranked = rankNamed(
      [
        { name: 'Calcário Agrícola Moído (Granel)' },
        { name: 'Óleo 15W40' }
      ],
      'calcário dolomítico',
      (item) => item.name
    );
    assert.equal(pickUnique(ranked)?.name, 'Calcário Agrícola Moído (Granel)');
  });

  it('com dois calcários, não escolhe sozinho', () => {
    const ranked = rankNamed(
      [
        { name: 'Calcário Agrícola Moído (Granel)' },
        { name: 'Calcário Britado' }
      ],
      'calcário',
      (item) => item.name
    );
    assert.equal(pickUnique(ranked), null);
    assert.equal(ranked.length, 2);
  });
});
