<script lang="ts">
  import { snackbar, dismissSnack } from '../../lib/ui/snackbar.svelte';
</script>

{#if snackbar.current}
  <div class="snackbar" role="status" aria-live="polite">
    <span class="message">{snackbar.current.message}</span>
    {#if snackbar.current.actionLabel}
      <button
        class="action"
        onclick={() => {
          snackbar.current?.onAction?.();
          dismissSnack();
        }}
      >
        {snackbar.current.actionLabel}
      </button>
    {/if}
  </div>
{/if}

<style>
  .snackbar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(16px + var(--safe-bottom));
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: min(92vw, 480px);
    padding: 6px 16px;
    border-radius: var(--radius);
    background: var(--color-text);
    color: var(--color-bg);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    z-index: 1000;
  }

  .message {
    padding: 10px 0;
  }

  .action {
    color: var(--color-primary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    padding: 0 4px;
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    .action {
      color: #5eead4;
    }
  }
</style>
