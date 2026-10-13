import React from 'react';

/**
 * Envolve um import() dinâmico do React.lazy com estratégia de auto-recovery:
 * Se o navegador estiver com um bundle antigo em memória e ocorrer deploy (mudando o hash do chunk),
 * a importação falha com "Failed to fetch dynamically imported module".
 * 
 * Este utilitário tenta recarregar a importação e, se falhar por erro de chunk desatualizado,
 * força um reload limpo da página uma única vez por sessão para baixar o bundle mais novo.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const pageHasAlreadyBeenReloaded = window.sessionStorage.getItem('cf_chunk_reload');

    try {
      const component = await factory();
      window.sessionStorage.removeItem('cf_chunk_reload');
      return component;
    } catch (error: any) {
      const isChunkError =
        error?.name === 'ChunkLoadError' ||
        /failed to fetch dynamically imported module/i.test(error?.message || '') ||
        /loading chunk/i.test(error?.message || '');

      if (isChunkError && !pageHasAlreadyBeenReloaded) {
        window.sessionStorage.setItem('cf_chunk_reload', 'true');
        window.location.reload();
        // Retorna uma Promise pendente enquanto o browser recarrega a página
        return new Promise<{ default: T }>(() => {});
      }

      throw error;
    }
  });
}
