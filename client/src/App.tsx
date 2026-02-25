import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth";
import Dashboard from "@/pages/dashboard";
import AcceptInvitation from "@/pages/accept-invitation";
import SetupWizard from "@/pages/setup-wizard";
import TeamProfile from "@/pages/team-profile";
import LandingPage from "@/pages/landing";
import { useAuth } from "@/lib/auth";

function ProtectedRoute({ component: Component }: { component: () => JSX.Element | null }) {
  const { token } = useAuth();
  if (!token) return <Redirect to="/landing" />;
  return <Component />;
}

function PublicOnly({ component: Component }: { component: () => JSX.Element | null }) {
  const { token } = useAuth();
  if (token) return <Redirect to="/" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/landing">
        <PublicOnly component={LandingPage} />
      </Route>
      <Route path="/login" component={AuthPage} />
      <Route path="/accept-invitation" component={AcceptInvitation} />
      <Route path="/wizard">
        <ProtectedRoute component={SetupWizard} />
      </Route>
      <Route path="/team/:userId">
        <ProtectedRoute component={TeamProfile} />
      </Route>
      <Route path="/">
        <ProtectedRoute component={Dashboard} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
