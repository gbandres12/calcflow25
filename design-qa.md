# Design QA: CalcFlow

## Referências e normalização

- Fonte visual: `/workspace/scratch/904eabde5041/upload/F0705928-EC2E-4079-8539-96781512A075.jpeg`
- Implementação: `http://terminal.local:4173/`, rota de dashboard após acesso de demonstração
- Captura da implementação: screenshot renderizado pelo navegador na sessão de validação final (`qa2.screenshot()`)
- Viewport da implementação: 1363 × 936 CSS px
- Dimensões da fonte visual: 1487 × 1058 px
- Densidade: fonte tratada como captura 1×; implementação capturada em 1×. A diferença de viewport foi considerada na comparação de layout, sem comparar browser chrome.
- Estado: usuário Carlos Mendes autenticado, Unidade Matriz, dashboard carregada, dados de demonstração, sem modal aberto.

## Evidência da comparação

### Full view

- Sidebar clara com 276 px, grupos de navegação, item Visão Geral ativo e rodapé do usuário.
- Topbar branca com empresa, unidade, notificações, avatar e menu do usuário.
- Hero com headline, imagem realista de pedreira, indicadores em quatro colunas e composição em verde floresta, oliva, areia e marfim.
- Abaixo do fold, a mesma estrutura de gráfico, fila de carregamento, estoque, alertas e busca presente na referência.

### Regiões focadas

- Hero: `/calcflow-quarry-hero.png` carregada e visível, com crop horizontal adequado.
- Estoque: `/calcflow-limestone-thumb.png` configurada para a miniatura do produto.
- Busca: textbox com filtro por nome, SKU, NCM ou categoria.
- Navegação: menus Visão Geral, Vendas & Romaneios e Produtos & NCM funcionando.

## Findings

- Nenhum P0, P1 ou P2 acionável na captura final.
- P3: o símbolo da marca no sidebar usa o ícone de camadas do Lucide como aproximação do símbolo fornecido na referência; substituir por um arquivo de marca vetorial oficial quando ele estiver disponível.

## Histórico de comparação

1. Captura inicial encontrou `ReferenceError: ShoppingCart is not defined` no botão Novo produto. Correção: reintrodução do import em `components/Dashboard.tsx`; nova captura renderizada corretamente.
2. A captura intermediária manteve o fundo antigo `#F4F6F9` por uma classe no `body`. Correção: atualização para `#F5F7F1`; nova captura confirmou `rgb(245, 247, 241)` no body e no root.
3. A captura intermediária tinha elementos extras no topbar, incluindo status do Supabase e texto “Sair”. Correção: alinhamento ao padrão da referência, mantendo a ação de logout acessível pelo ícone do usuário; nova captura final aprovada.

## Interações testadas

- Busca por `dolomítico` filtra o produto correspondente.
- `Produtos & NCM` navega para a tela de estoque.
- `Vendas & Romaneios` navega para a tela de vendas.
- `Visão Geral` restaura a dashboard.
- Imagem hero carrega com `naturalWidth` válido.
- Nenhum erro de aplicação foi registrado no console do navegador. Diagnóstico isolado de extensão do navegador foi desconsiderado.

## Implementation Checklist

- [x] Hierarquia, grid, navegação e dashboard principal implementados.
- [x] Paleta, tipografia Manrope, tokens, estados e responsividade base aplicados.
- [x] Imagens da pedreira e do estoque adicionadas ao projeto.
- [x] Busca e navegação principal verificadas no navegador.
- [x] Build de produção e `git diff --check` executados.

final result: passed
