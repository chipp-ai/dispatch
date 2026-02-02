<script lang="ts">
  type Size = "sm" | "md" | "lg" | "xl";

  export let src: string = "";
  export let alt: string = "";
  export let fallback: string = "";
  export let size: Size = "md";
  export let backgroundColor: string = "";
  export let textColor: string = "";

  let imageError = false;

  function handleError() {
    imageError = true;
  }

  $: initials = fallback || alt.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  $: avatarStyle = backgroundColor
    ? `background-color: ${backgroundColor}; color: ${textColor || "inherit"};`
    : "";
</script>

<div class="avatar avatar-{size}" style={avatarStyle} {...$$restProps}>
  {#if src && !imageError}
    <img {src} {alt} class="avatar-image" on:error={handleError} />
  {:else}
    <span class="avatar-fallback" style={textColor ? `color: ${textColor};` : ""}>{initials}</span>
  {/if}
</div>

<style>
  .avatar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: var(--radius-full);
    background-color: var(--bg-tertiary);
  }

  .avatar-sm {
    width: 24px;
    height: 24px;
    font-size: var(--text-xs);
  }

  .avatar-md {
    width: 32px;
    height: 32px;
    font-size: var(--text-sm);
  }

  .avatar-lg {
    width: 40px;
    height: 40px;
    font-size: var(--text-base);
  }

  .avatar-xl {
    width: 64px;
    height: 64px;
    font-size: var(--text-xl);
  }

  .avatar-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-fallback {
    font-weight: var(--font-medium);
    color: var(--text-secondary);
  }

</style>
