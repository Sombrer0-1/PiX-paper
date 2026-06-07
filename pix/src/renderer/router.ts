/**
 * Vue Router Configuration — PiX-paper
 */

import { createRouter, createMemoryHistory, type RouteRecordRaw } from "vue-router";
import HomePage from "./pages/HomePage.vue";
import ResearchProjectPage from "./pages/ResearchProjectPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: HomePage,
  },
  {
    path: "/research",
    name: "research",
    component: ResearchProjectPage,
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
