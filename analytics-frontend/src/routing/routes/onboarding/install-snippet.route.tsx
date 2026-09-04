import { createRoute } from "@tanstack/react-router"

import { InstallSnippetPage } from "@/pages/onboarding/install-snippet-page"
import { requireActiveSubscription } from "@/routing/guards"
import { appRoute } from "@/routing/routes/app.route"
import { validateInstallSnippetSearch } from "@/routing/search-validators"

export const installSnippetRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/onboarding/snippet",
  beforeLoad: requireActiveSubscription,
  validateSearch: validateInstallSnippetSearch,
  component: InstallSnippetPage,
})
