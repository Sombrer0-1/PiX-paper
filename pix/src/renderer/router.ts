/**
 * Vue Router Configuration
 */

import { createRouter, createMemoryHistory, type RouteRecordRaw } from "vue-router";
import HomePage from "./pages/HomePage.vue";
import WorkspacePage from "./pages/WorkspacePage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: HomePage,
  },
  {
    path: "/workspace",
    name: "workspace",
    component: WorkspacePage,
    meta: { paperView: "dashboard" },
  },
  {
    path: "/workspace/dashboard",
    name: "paper-dashboard",
    component: WorkspacePage,
    meta: { paperView: "dashboard" },
  },
  {
    path: "/workspace/stage/:stage",
    name: "paper-stage",
    component: WorkspacePage,
    meta: { paperView: "stage" },
  },
  {
    path: "/workspace/gate",
    name: "paper-gate",
    component: WorkspacePage,
    meta: { paperView: "gate" },
  },
  {
    path: "/workspace/library",
    name: "paper-library",
    component: WorkspacePage,
    meta: { paperView: "library" },
  },
  {
    path: "/workspace/figures",
    name: "paper-figures",
    component: WorkspacePage,
    meta: { paperView: "figures" },
  },
  {
    path: "/workspace/results",
    name: "paper-results",
    component: WorkspacePage,
    meta: { paperView: "results" },
  },
  {
    path: "/workspace/manuscript",
    name: "paper-manuscript",
    component: WorkspacePage,
    meta: { paperView: "manuscript" },
  },
  {
    path: "/workspace/artifact/:artifactId",
    name: "paper-artifact",
    component: WorkspacePage,
    meta: { paperView: "artifact" },
  },
  {
    path: "/workspace/inbox",
    name: "paper-inbox",
    component: WorkspacePage,
    meta: { paperView: "inbox" },
  },
  {
    path: "/settings",
    name: "settings",
    component: SettingsPage,
  },
];

const router = createRouter({
  history: createMemoryHistory(),
  routes,
});

export default router;
