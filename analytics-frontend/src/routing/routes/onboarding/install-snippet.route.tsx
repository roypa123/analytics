import { createRoute } from "@tanstack/react-router"

import { InstallSnippetPage } from "@/pages/onboarding/install-snippet-page"
import { appRoute } from "@/routing/routes/app.route"
import { validateInstallSnippetSearch } from "@/routing/search-validators"

export const installSnippetRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/onboarding/snippet",
  validateSearch: validateInstallSnippetSearch,
  component: InstallSnippetPage,
})
