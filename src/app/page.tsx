import Dashboard, { type Employee, type PracticeSettings } from "./dashboard";
import SignIn from "./sign-in";
import { hasSupabaseConfig, isDemoModeAllowed } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

type JsonRecord = Record<string, unknown>;

const defaultBenefits = ["401(k)", "Health insurance", "Aflac"];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function date(value: unknown) {
  return typeof value === "string" ? value : "";
}

function employeeFromRow(row: JsonRecord): Employee {
  const notes = Array.isArray(row.notes)
    ? row.notes.filter(
        (note): note is { date: string; type: string; detail: string } =>
          isRecord(note) &&
          typeof note.date === "string" &&
          typeof note.type === "string" &&
          typeof note.detail === "string",
      )
    : [];
  const status =
    row.status === "inactive"
      ? "Inactive"
      : row.status === "on_probation"
        ? "On probation"
        : "Active";

  return {
    id: text(row.id),
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    title: text(row.job_title),
    employmentType: row.employment_type === "PT" ? "PT" : "FT",
    email: text(row.email),
    phone: text(row.phone),
    address: text(row.address),
    hireDate: date(row.hired_on),
    probationEnd: date(row.probation_end),
    nextReview: date(row.next_review),
    lastRaise: date(row.last_raise),
    status,
    terminationDate: date(row.terminated_on),
    photoDataUrl: text(row.photo_data_url) || undefined,
    benefits: Array.isArray(row.benefits)
      ? row.benefits.filter((benefit): benefit is string => typeof benefit === "string")
      : [],
    notes,
  };
}

function appSettingsFromRow(
  row: JsonRecord | null,
  practiceName: string,
  locations: string[],
): PracticeSettings {
  const provider = row?.background_search_provider;
  return {
    practiceName,
    locations,
    notificationEmail: text(row?.notification_email),
    logoDataUrl: text(row?.logo_data_url),
    benefits: Array.isArray(row?.benefits)
      ? row.benefits.filter((benefit): benefit is string => typeof benefit === "string")
      : defaultBenefits,
    backgroundSearchProvider:
      provider === "checkr" || provider === "goodhire" || provider === "local-court"
        ? provider
        : "none",
  };
}

function StatusPage({ title, message }: { title: string; message: string }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">EMPLOYEE HUB</span>
        <h1>{title}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

export default async function Home() {
  if (!hasSupabaseConfig()) {
    if (isDemoModeAllowed()) {
      return <Dashboard mode="demo" />;
    }
    return (
      <StatusPage
        title="Application setup required"
        message="Configure the Supabase project URL and publishable key in Vercel before enabling sign-in. No employee data is available in this deployment."
      />
    );
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError) {
    return <StatusPage title="Could not verify session" message="Refresh the page or sign in again." />;
  }
  const userId = claimsData?.claims?.sub;
  if (!userId) return <SignIn />;

  const { data: membership, error: membershipError } = await supabase
    .from("practice_memberships")
    .select("practice_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError) {
    return (
      <StatusPage
        title="Practice access could not be loaded"
        message="Confirm the Employee Hub SQL scripts have been run and that your account has a practice membership."
      />
    );
  }
  if (!membership) {
    return (
      <StatusPage
        title="Practice access not set up"
        message="Ask your practice administrator to add your Supabase account to the practice membership list."
      />
    );
  }
  if (membership.role !== "owner" && membership.role !== "manager") {
    return (
      <StatusPage
        title="Practice manager access required"
        message="This Employee Hub workspace is currently set up for practice owners and managers. Contact your administrator if you need access."
      />
    );
  }

  const practiceId = text(membership.practice_id);
  const [practiceResult, employeeResult, locationResult, settingsResult] =
    await Promise.all([
      supabase.from("practices").select("name").eq("id", practiceId).single(),
      supabase
        .from("employees")
        .select("*")
        .eq("practice_id", practiceId)
        .order("last_name"),
      supabase
        .from("practice_locations")
        .select("name")
        .eq("practice_id", practiceId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("practice_app_settings")
        .select("*")
        .eq("practice_id", practiceId)
        .maybeSingle(),
    ]);

  const failedQuery = [
    practiceResult.error,
    employeeResult.error,
    locationResult.error,
    settingsResult.error,
  ].some(Boolean);
  if (failedQuery || !practiceResult.data) {
    return (
      <StatusPage
        title="Practice data could not be loaded"
        message="Check that the application data migration is installed and that your account has the required practice role."
      />
    );
  }

  const locations =
    locationResult.data?.map((location) => text(location.name)).filter(Boolean) ?? [];
  const settings = appSettingsFromRow(
    settingsResult.data,
    text(practiceResult.data.name),
    locations,
  );

  return (
    <Dashboard
      initialEmployees={(employeeResult.data ?? []).map((row) => employeeFromRow(row))}
      initialSettings={settings}
      mode="live"
      practiceId={practiceId}
    />
  );
}
