<script setup lang="ts">
/**
 * AppLayout - Three-panel workspace shell
 *
 * ┌────────┬────────────────────────┬────────┐
 * │ Left   │ Center                 │ Right  │
 * │        │ (topbar+content+       │        │
 * │        │  composer internal)    │        │
 * └────────┴────────────────────────┴────────┘
 *
 * Left and Right are full-height. Center manages its own
 * internal header / content / composer structure.
 */
</script>

<template>
  <div class="app-layout">
    <aside class="layout-left">
      <slot name="left" />
    </aside>

    <main class="layout-center">
      <slot name="center" />
    </main>

    <aside class="layout-right">
      <slot name="right" />
    </aside>

    <slot name="overlay" />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
  position: relative;
  gap: 8px;
  padding: 10px 12px 10px 10px;
  background: var(--pix-bg-app);
}

.layout-left {
  width: var(--pix-left-width);
  min-width: var(--pix-left-width);
  background: var(--pix-bg-left);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xl);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--pix-shadow-sm);
}

.layout-center {
  flex: 1;
  min-width: 0;
  background: var(--pix-bg-content);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--pix-shadow-sm);
  position: relative;
  z-index: 1;
}

.layout-right {
  width: var(--pix-right-width);
  min-width: var(--pix-right-width);
  background: var(--pix-bg-right);
  border: 1px solid var(--pix-border-light);
  border-radius: var(--pix-radius-xl);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--pix-shadow-sm);
}

@media (max-width: 960px) {
  .app-layout {
    gap: 6px;
    padding: 8px;
  }

  .layout-left {
    width: 220px;
    min-width: 220px;
  }

  .layout-right {
    display: none;
  }
}

@media (max-width: 720px) {
  .layout-left {
    width: 196px;
    min-width: 196px;
  }
}
</style>
