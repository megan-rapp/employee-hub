"use client";

import Image from "next/image";
import {
  ChangeEvent,
  FormEvent,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Tab = "Contact" | "Employment" | "Benefits" | "Disciplinary" | "Audit log";
type BackgroundSearchProvider = "none" | "checkr" | "goodhire" | "local-court";
type TimeTrackingDemoState = "idle" | "prompt" | "break-confirmed" | "no-break";

export type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  employmentType: "FT" | "PT";
  email: string;
  phone: string;
  address: string;
  hireDate: string;
  probationEnd: string;
  nextReview: string;
  lastRaise: string;
  status: "Active" | "On probation" | "Inactive";
  terminationDate: string;
  photoDataUrl?: string;
  benefits: string[];
  notes: { date: string; type: string; detail: string }[];
};

export type PracticeSettings = {
  practiceName: string;
  locations: string[];
  notificationEmail: string;
  logoDataUrl: string;
  benefits: string[];
  backgroundSearchProvider: BackgroundSearchProvider;
};

type StoredPracticeSettings = Omit<
  PracticeSettings,
  "benefits" | "backgroundSearchProvider"
> & {
  benefits?: string[];
  backgroundSearchProvider?: BackgroundSearchProvider;
};

const defaultPracticeSettings: PracticeSettings = {
  practiceName: "Northstar Dental",
  locations: ["Main office"],
  notificationEmail: "",
  logoDataUrl: "",
  benefits: ["401(k)", "Health insurance", "Aflac"],
  backgroundSearchProvider: "none",
};

const settingsStorageKey = "employee-hub-practice-settings";
const settingsStorageEvent = "employee-hub-practice-settings-change";
const settingsStorageReadError = "__employee_hub_settings_read_error__";

function subscribeToPracticeSettings(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(settingsStorageEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(settingsStorageEvent, onChange);
  };
}

function getPracticeSettingsSnapshot() {
  try {
    return window.localStorage.getItem(settingsStorageKey);
  } catch {
    return settingsStorageReadError;
  }
}

function getServerPracticeSettingsSnapshot() {
  return null;
}

const demoEmployees: Employee[] = [
  {
    id: "1",
    firstName: "Avery",
    lastName: "Brooks",
    title: "Dental Assistant",
    employmentType: "FT",
    email: "avery.brooks@example.com",
    phone: "(555) 010-0101",
    address: "100 Example Street, Suite 1",
    hireDate: "2023-04-17",
    probationEnd: "",
    nextReview: "2026-12-15",
    lastRaise: "2025-06-01",
    status: "Active",
    terminationDate: "",
    benefits: ["401(k)", "Health insurance"],
    notes: [],
  },
  {
    id: "2",
    firstName: "Casey",
    lastName: "Morgan",
    title: "Receptionist",
    employmentType: "FT",
    email: "casey.morgan@example.com",
    phone: "(555) 010-0102",
    address: "200 Example Avenue",
    hireDate: "2025-09-08",
    probationEnd: "2025-12-08",
    nextReview: "2026-12-08",
    lastRaise: "",
    status: "Active",
    terminationDate: "",
    benefits: ["Health insurance"],
    notes: [],
  },
  {
    id: "3",
    firstName: "Jordan",
    lastName: "Chen",
    title: "Dental Hygienist",
    employmentType: "FT",
    email: "jordan.chen@example.com",
    phone: "(555) 010-0103",
    address: "300 Sample Road",
    hireDate: "2021-02-22",
    probationEnd: "",
    nextReview: "2026-11-30",
    lastRaise: "2025-11-15",
    status: "Active",
    terminationDate: "",
    benefits: ["401(k)", "Health insurance"],
    notes: [],
  },
  {
    id: "4",
    firstName: "Morgan",
    lastName: "Reed",
    title: "Office Manager",
    employmentType: "FT",
    email: "morgan.reed@example.com",
    phone: "(555) 010-0104",
    address: "400 Sample Lane",
    hireDate: "2019-08-12",
    probationEnd: "",
    nextReview: "2027-01-12",
    lastRaise: "2025-08-12",
    status: "Active",
    terminationDate: "",
    benefits: ["401(k)", "Health insurance", "Aflac"],
    notes: [],
  },
  {
    id: "5",
    firstName: "Riley",
    lastName: "Patel",
    title: "Marketer",
    employmentType: "PT",
    email: "riley.patel@example.com",
    phone: "(555) 010-0105",
    address: "500 Sample Boulevard",
    hireDate: "2026-10-19",
    probationEnd: "2027-01-19",
    nextReview: "2027-01-19",
    lastRaise: "",
    status: "On probation",
    terminationDate: "",
    benefits: [],
    notes: [],
  },
  {
    id: "6",
    firstName: "Taylor",
    lastName: "Flores",
    title: "Dental Assistant",
    employmentType: "FT",
    email: "taylor.flores@example.com",
    phone: "(555) 010-0106",
    address: "600 Sample Court",
    hireDate: "2022-05-02",
    probationEnd: "",
    nextReview: "2026-12-02",
    lastRaise: "2024-05-02",
    status: "Inactive",
    terminationDate: "2026-09-30",
    benefits: [],
    notes: [],
  },
];

function employeeDatabaseFields(updates: Partial<Employee>) {
  const fields: Record<string, unknown> = {};
  const columns: Partial<Record<keyof Employee, string>> = {
    firstName: "first_name",
    lastName: "last_name",
    title: "job_title",
    employmentType: "employment_type",
    email: "email",
    phone: "phone",
    address: "address",
    hireDate: "hired_on",
    probationEnd: "probation_end",
    nextReview: "next_review",
    lastRaise: "last_raise",
    terminationDate: "terminated_on",
    benefits: "benefits",
    notes: "notes",
    photoDataUrl: "photo_data_url",
  };

  for (const [key, value] of Object.entries(updates)) {
    if (key === "status") {
      fields.status =
        value === "Inactive"
          ? "inactive"
          : value === "On probation"
            ? "on_probation"
            : "active";
    } else {
      const column = columns[key as keyof Employee];
      if (column) {
        const isDate = [
          "hireDate",
          "probationEnd",
          "nextReview",
          "lastRaise",
          "terminationDate",
        ].includes(key);
        fields[column] = isDate && value === "" ? null : value;
      }
    }
  }
  return fields;
}

const tabs: Tab[] = ["Contact", "Employment", "Benefits", "Disciplinary", "Audit log"];

function initials(employee: Employee) {
  return `${employee.firstName[0]}${employee.lastName[0]}`;
}

function displayDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function getProbationStatus(endDate: string): Employee["status"] {
  return endDate && new Date(`${endDate}T23:59:59`).getTime() >= Date.now()
    ? "On probation"
    : "Active";
}

function isPracticeSettings(value: unknown): value is StoredPracticeSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.practiceName === "string" &&
    Array.isArray(settings.locations) &&
    settings.locations.every((location) => typeof location === "string") &&
    typeof settings.notificationEmail === "string" &&
    typeof settings.logoDataUrl === "string" &&
    (settings.benefits === undefined ||
      (Array.isArray(settings.benefits) &&
        settings.benefits.every((benefit) => typeof benefit === "string"))) &&
    (settings.backgroundSearchProvider === undefined ||
      ["none", "checkr", "goodhire", "local-court"].includes(
        String(settings.backgroundSearchProvider),
      )) &&
    (!settings.logoDataUrl ||
      /^data:image\/(png|jpeg|webp);base64,/.test(settings.logoDataUrl))
  );
}

export default function Dashboard({
  mode = "demo",
  practiceId,
  initialEmployees: employeeRecords = demoEmployees,
  initialSettings = defaultPracticeSettings,
}: {
  mode?: "demo" | "live";
  practiceId?: string;
  initialEmployees?: Employee[];
  initialSettings?: PracticeSettings;
}) {
  const router = useRouter();
  const [employees, setEmployees] = useState(employeeRecords);
  const [selectedId, setSelectedId] = useState(employeeRecords[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("Contact");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"firstName" | "lastName" | "title">(
    "lastName",
  );
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [auditMessage, setAuditMessage] = useState("");
  const [showDisciplinaryForm, setShowDisciplinaryForm] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(initialSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newBenefit, setNewBenefit] = useState("");
  const [photoNotice, setPhotoNotice] = useState("");
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [timeTrackingDemo, setTimeTrackingDemo] =
    useState<TimeTrackingDemoState>("idle");

  const settingsSnapshot = useSyncExternalStore(
    subscribeToPracticeSettings,
    getPracticeSettingsSnapshot,
    getServerPracticeSettingsSnapshot,
  );
  const storedSettings = useMemo(() => {
    if (!settingsSnapshot || settingsSnapshot === settingsStorageReadError) return null;
    try {
      const parsed: unknown = JSON.parse(settingsSnapshot);
      return isPracticeSettings(parsed)
        ? {
            ...parsed,
            benefits: parsed.benefits ?? defaultPracticeSettings.benefits,
            backgroundSearchProvider:
              parsed.backgroundSearchProvider ??
              defaultPracticeSettings.backgroundSearchProvider,
          }
        : null;
    } catch {
      return null;
    }
  }, [settingsSnapshot]);
  const practiceSettings = mode === "live"
    ? savedSettings
    : storedSettings ?? defaultPracticeSettings;
  const settingsLoadNotice =
    settingsSnapshot === settingsStorageReadError
      ? "Practice settings could not be loaded from this browser."
      : settingsSnapshot && !storedSettings
        ? "Saved practice settings could not be read. Review and save them again."
        : "";

  const selectedEmployee =
    employees.find((employee) => employee.id === selectedId) ?? employees[0];

  const visibleEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return employees
      .filter((employee) => {
        const searchable =
          `${employee.firstName} ${employee.lastName} ${employee.title}`.toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const valueA = a[sortBy].toLowerCase();
        const valueB = b[sortBy].toLowerCase();
        return valueA.localeCompare(valueB) || a.lastName.localeCompare(b.lastName);
      });
  }, [employees, query, sortBy]);

  function updateEmployee(updates: Partial<Employee>) {
    if (!selectedEmployee) return;
    const employeeId = selectedEmployee.id;
    setEmployees((current) =>
      current.map((employee) =>
        employee.id === employeeId
          ? { ...employee, ...updates }
          : employee,
      ),
    );
    if (mode === "live" && practiceId) {
      void createSupabaseBrowserClient()
        .from("employees")
        .update(employeeDatabaseFields(updates))
        .eq("practice_id", practiceId)
        .eq("id", employeeId)
        .then((result: { error: { message: string } | null }) => {
          const { error } = result;
          if (error) {
            setAccountNotice("Employee changes could not be saved. Refresh and try again.");
          }
        });
    }
  }

  function handleEmployeePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !selectedEmployee) return;
    event.target.value = "";

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setPhotoNotice("Choose a PNG, JPEG, or WebP photo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoNotice("Choose a photo smaller than 2 MB.");
      return;
    }

    const employeeId = selectedEmployee.id;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        setPhotoNotice("The photo could not be read. Choose another image.");
        return;
      }
      const photoDataUrl = reader.result;
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === employeeId
            ? { ...employee, photoDataUrl }
            : employee,
        ),
      );
      if (mode === "live" && practiceId) {
        void createSupabaseBrowserClient()
          .from("employees")
          .update({ photo_data_url: photoDataUrl })
          .eq("practice_id", practiceId)
          .eq("id", employeeId)
          .then((result: { error: { message: string } | null }) => {
            const { error } = result;
            if (error) {
              setPhotoNotice("Photo could not be saved. Refresh and try again.");
            }
          });
      }
      setPhotoNotice("Employee photo updated.");
    };
    reader.onerror = () =>
      setPhotoNotice("The photo could not be read. Choose another image.");
    reader.readAsDataURL(file);
  }

  function removeEmployeePhoto() {
    if (!selectedEmployee) return;
    const employeeId = selectedEmployee.id;
    setEmployees((current) =>
      current.map((employee) =>
        employee.id === employeeId
          ? { ...employee, photoDataUrl: undefined }
          : employee,
      ),
    );
    if (mode === "live" && practiceId) {
      void createSupabaseBrowserClient()
        .from("employees")
        .update({ photo_data_url: null })
        .eq("practice_id", practiceId)
        .eq("id", employeeId)
        .then((result: { error: { message: string } | null }) => {
          const { error } = result;
          if (error) {
            setPhotoNotice("Photo could not be removed from saved data.");
          }
        });
    }
    setPhotoNotice("Employee photo removed.");
  }

  async function addEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const employee: Employee = {
      id: crypto.randomUUID(),
      firstName: String(formData.get("firstName")).trim(),
      lastName: String(formData.get("lastName")).trim(),
      title: String(formData.get("title")).trim(),
      employmentType: String(formData.get("employmentType")) === "PT" ? "PT" : "FT",
      email: String(formData.get("email")).trim(),
      phone: String(formData.get("phone")).trim(),
      address: String(formData.get("address")).trim(),
      hireDate: String(formData.get("hireDate")),
      probationEnd: String(formData.get("probationEnd")),
      nextReview: "",
      lastRaise: "",
      status: getProbationStatus(String(formData.get("probationEnd"))),
      terminationDate: "",
      benefits: [],
      notes: [],
    };
    if (mode === "live" && practiceId) {
      const { error } = await createSupabaseBrowserClient()
        .from("employees")
        .insert({
          id: employee.id,
          practice_id: practiceId,
          first_name: employee.firstName,
          last_name: employee.lastName,
          job_title: employee.title,
          employment_type: employee.employmentType,
          email: employee.email,
          phone: employee.phone,
          address: employee.address,
          hired_on: employee.hireDate,
          probation_end: employee.probationEnd || null,
          status: employee.status === "On probation" ? "on_probation" : "active",
        });
      if (error) {
        setAccountNotice("Employee could not be added. Check your practice access and try again.");
        return;
      }
    }
    setEmployees((current) => [...current, employee]);
    setSelectedId(employee.id);
    setActiveTab("Contact");
    setShowAddEmployee(false);
    event.currentTarget.reset();
  }

  function addDisciplinaryNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const note = {
      date: String(formData.get("date")),
      type: String(formData.get("type")),
      detail: String(formData.get("detail")).trim(),
    };
    updateEmployee({ notes: [...selectedEmployee.notes, note] });
    setShowDisciplinaryForm(false);
    event.currentTarget.reset();
  }

  function requestAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuditMessage(
      "TDO is not connected. No audit data was requested or analyzed.",
    );
  }

  function recordTermination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    updateEmployee({
      status: "Inactive",
      terminationDate: String(formData.get("terminationDate")),
    });
  }

  function openSettings() {
    setSettingsDraft({
      ...practiceSettings,
      locations: [...practiceSettings.locations],
    });
    setSettingsNotice("");
    setNewLocation("");
    setNewBenefit("");
    setShowAccountMenu(false);
    setShowSettings(true);
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const updatedSettings = {
      ...settingsDraft,
      practiceName: settingsDraft.practiceName.trim(),
      notificationEmail: settingsDraft.notificationEmail.trim(),
      locations: settingsDraft.locations.map((location) => location.trim()),
      benefits: settingsDraft.benefits.map((benefit) => benefit.trim()),
      backgroundSearchProvider: settingsDraft.backgroundSearchProvider,
    };

    if (!updatedSettings.practiceName || updatedSettings.locations.some((location) => !location)) {
      setSettingsNotice("Enter a practice name and a name for each location.");
      return;
    }
    if (updatedSettings.benefits.some((benefit) => !benefit)) {
      setSettingsNotice("Benefit names cannot be empty.");
      return;
    }
    if (new Set(updatedSettings.benefits.map((benefit) => benefit.toLowerCase())).size !== updatedSettings.benefits.length) {
      setSettingsNotice("Each benefit must have a unique name.");
      return;
    }

    if (mode === "live" && practiceId) {
      const supabase = createSupabaseBrowserClient();
      const { error: practiceError } = await supabase
        .from("practices")
        .update({ name: updatedSettings.practiceName })
        .eq("id", practiceId);
      if (practiceError) {
        setSettingsNotice("Practice name could not be saved. Check your practice role.");
        return;
      }

      const { error: settingsError } = await supabase
        .from("practice_app_settings")
        .upsert({
          practice_id: practiceId,
          notification_email: updatedSettings.notificationEmail,
          logo_data_url: updatedSettings.logoDataUrl,
          benefits: updatedSettings.benefits,
          background_search_provider: updatedSettings.backgroundSearchProvider,
        });
      if (settingsError) {
        setSettingsNotice("Practice settings could not be saved. Refresh and try again.");
        return;
      }

      const { data: existingLocations, error: locationsError } = await supabase
        .from("practice_locations")
        .select("id, name")
        .eq("practice_id", practiceId);
      if (locationsError) {
        setSettingsNotice("Practice locations could not be loaded for saving.");
        return;
      }
      const { error: locationUpsertError } = await supabase
        .from("practice_locations")
        .upsert(
          updatedSettings.locations.map((name) => ({
            practice_id: practiceId,
            name,
            is_active: true,
          })),
          { onConflict: "practice_id,name" },
        );
      if (locationUpsertError) {
        setSettingsNotice("Practice locations could not be saved. Check for duplicate names.");
        return;
      }

      const activeLocationNames = new Set(
        updatedSettings.locations.map((name) => name.toLowerCase()),
      );
      const deactivationResults = await Promise.all(
        (existingLocations ?? [])
          .filter((location: { id: string; name: string }) => !activeLocationNames.has(location.name.toLowerCase()))
          .map((location: { id: string; name: string }) =>
            supabase
              .from("practice_locations")
              .update({ is_active: false })
              .eq("id", location.id)
              .eq("practice_id", practiceId),
          ),
      );
      if (deactivationResults.some((result) => result.error)) {
        setSettingsNotice("Some removed locations could not be deactivated.");
        return;
      }

      const updatedEmployees = employees.map((employee) => ({
        ...employee,
        benefits: employee.benefits.filter((benefit) =>
          updatedSettings.benefits.includes(benefit),
        ),
      }));
      const benefitResults = await Promise.all(
        updatedEmployees
          .filter((employee, index) =>
            employee.benefits.length !== employees[index].benefits.length,
          )
          .map((employee) =>
            supabase
              .from("employees")
              .update({ benefits: employee.benefits })
              .eq("practice_id", practiceId)
              .eq("id", employee.id),
          ),
      );
      if (benefitResults.some((result) => result.error)) {
        setSettingsNotice("Settings saved, but some employee benefit assignments were not updated.");
        return;
      }

      setSavedSettings(updatedSettings);
      setEmployees(updatedEmployees);
      setShowSettings(false);
      setAccountNotice("Practice settings saved.");
      return;
    }

    try {
      window.localStorage.setItem(settingsStorageKey, JSON.stringify(updatedSettings));
      setEmployees((current) =>
        current.map((employee) => ({
          ...employee,
          benefits: employee.benefits.filter((benefit) =>
            updatedSettings.benefits.includes(benefit),
          ),
        })),
      );
      window.dispatchEvent(new Event(settingsStorageEvent));
      setShowSettings(false);
      setAccountNotice("Practice settings saved in this browser only. Notifications are not active.");
    } catch {
      setSettingsNotice("Settings could not be saved in this browser. Check available storage and try again.");
    }
  }

  function addLocation() {
    const location = newLocation.trim();
    if (!location) return;
    if (settingsDraft.locations.some((existing) => existing.toLowerCase() === location.toLowerCase())) {
      setSettingsNotice("That location is already listed.");
      return;
    }
    setSettingsDraft((current) => ({ ...current, locations: [...current.locations, location] }));
    setNewLocation("");
    setSettingsNotice("");
  }

  function addBenefit() {
    const benefit = newBenefit.trim();
    if (!benefit) return;
    if (settingsDraft.benefits.some((existing) => existing.toLowerCase() === benefit.toLowerCase())) {
      setSettingsNotice("That benefit is already listed.");
      return;
    }
    setSettingsDraft((current) => ({ ...current, benefits: [...current.benefits, benefit] }));
    setNewBenefit("");
    setSettingsNotice("");
  }

  function handleLogoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setSettingsNotice("Choose a PNG, JPEG, or WebP logo image.");
      event.target.value = "";
      return;
    }
    if (file.size > 1024 * 1024) {
      setSettingsNotice("The logo must be 1 MB or smaller.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        setSettingsNotice("The logo could not be read. Choose another image.");
        return;
      }
      setSettingsDraft((current) => ({ ...current, logoDataUrl: result }));
      setSettingsNotice("");
    };
    reader.onerror = () => setSettingsNotice("The logo could not be read. Choose another image.");
    reader.readAsDataURL(file);
  }

  return (
    <div className="app-shell">
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-brand">
            <Image alt="TDO Software" className="tdo-logo" height={303} priority src="/tdo-logo.png" width={303} />
            <span className="topbar-divider" aria-hidden="true" />
            <div className="practice-identity">
              {practiceSettings.logoDataUrl ? (
                <span aria-label={`${practiceSettings.practiceName} logo`} className="workspace-logo" role="img" style={{ backgroundImage: `url("${practiceSettings.logoDataUrl}")` }} />
              ) : (
                <span className="workspace-icon">{practiceSettings.practiceName.charAt(0).toUpperCase()}</span>
              )}
              <span className="workspace-copy">
                <strong>{practiceSettings.practiceName}</strong>
                <small>Practice workspace</small>
              </span>
            </div>
            <div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>People</strong></div>
          </div>
          <div className="topbar-right">
            <span className="preview-chip"><i /> {mode === "live" ? "Connected workspace" : "Demo preview"}</span>
            <div className="account-menu-wrap">
              <button
                aria-expanded={showAccountMenu}
                aria-haspopup="menu"
                aria-label="Open account menu"
                className="user-avatar top-avatar account-menu-trigger"
                onClick={() => setShowAccountMenu((open) => !open)}
                type="button"
              >
                DR
              </button>
              {showAccountMenu && (
                <div className="account-dropdown" role="menu">
                  <div className="account-dropdown-heading">Practice manager</div>
                  <button onClick={openSettings} role="menuitem" type="button"><span>⚙</span> Practice settings</button>
                  <button
                    onClick={() => {
                      setShowAccountMenu(false);
                      if (mode === "live") {
                        void createSupabaseBrowserClient().auth.signOut().then((result: { error: { message: string } | null }) => {
                          const { error } = result;
                          if (error) {
                            setAccountNotice("Sign out failed. Please try again.");
                            return;
                          }
                          router.refresh();
                        });
                      } else {
                        setAccountNotice("Sign out is unavailable in local demo mode.");
                      }
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span>↪</span> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content">
          {(accountNotice || settingsLoadNotice) && (
            <div className="account-notice" role="status">
              <span>{accountNotice || settingsLoadNotice}</span>
              <button aria-label="Dismiss message" onClick={() => setAccountNotice("")} type="button">×</button>
            </div>
          )}
          <div className={`safety-banner ${mode === "live" ? "connected-banner" : ""}`} id="privacy">
            <span className="safety-icon">!</span>
            <p>
              {mode === "live" ? (
                <><strong>Supabase connected.</strong> Employee records are saved to your practice database. TDO12, notifications, and background-check integrations are not connected.</>
              ) : (
                <><strong>Demo mode.</strong> Fictional sample records only. Changes are temporary; authentication, secure storage, and external integrations are not configured. Do not enter real employee information.</>
              )}
            </p>
            <button type="button" aria-label="Dismiss prototype notice">×</button>
          </div>

          <section className="page-heading" id="directory">
            <div>
              <div className="eyebrow">YOUR TEAM</div>
              <h1>People</h1>
              <p className="heading-subtitle">A thoughtful space for your team&apos;s information.</p>
            </div>
            <button className="primary-button" onClick={() => setShowAddEmployee(true)} type="button">
              <span>＋</span> Add employee
            </button>
          </section>

          <div className="people-layout">
            <div className="directory-column">
            <section className="directory-panel" aria-label="Employee directory">
              <div className="directory-header">
                <div>
                  <h2>Directory <span className="count-pill">{employees.length}</span></h2>
                  <p>Your people at a glance</p>
                </div>
                <button className="more-button" type="button" aria-label="Directory options">···</button>
              </div>
              <label className="search-field">
                <span aria-hidden="true">⌕</span>
                <input
                  aria-label="Search employees"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search people..."
                  value={query}
                />
                <kbd>⌘ K</kbd>
              </label>
              <div className="list-tools">
                <span>{visibleEmployees.length} employees</span>
                <label>
                  Sort
                  <select
                    aria-label="Sort employees"
                    onChange={(event) =>
                      setSortBy(event.target.value as "firstName" | "lastName" | "title")
                    }
                    value={sortBy}
                  >
                    <option value="firstName">First name</option>
                    <option value="lastName">Last name</option>
                    <option value="title">Title</option>
                  </select>
                </label>
              </div>
              <div className="employee-list">
                {visibleEmployees.map((employee) => (
                  <button
                    className={`employee-row ${employee.id === selectedId ? "selected" : ""}`}
                    key={employee.id}
                    onClick={() => {
                      setSelectedId(employee.id);
                      setActiveTab("Contact");
                      setAuditMessage("");
                      setPhotoNotice("");
                    }}
                    type="button"
                  >
                    <span
                      aria-label={employee.photoDataUrl ? `${employee.firstName} ${employee.lastName} photo` : undefined}
                      className={`employee-avatar avatar-${employee.id.charCodeAt(0) % 5} ${employee.photoDataUrl ? "has-photo" : ""}`}
                      role={employee.photoDataUrl ? "img" : undefined}
                      style={employee.photoDataUrl ? { backgroundImage: `url("${employee.photoDataUrl}")` } : undefined}
                    >
                      {!employee.photoDataUrl && initials(employee)}
                    </span>
                    <span className="employee-row-copy">
                      <strong>{employee.firstName} {employee.lastName}</strong>
                      <small>{employee.title} · {employee.employmentType}</small>
                    </span>
                    <span className={`status-dot ${employee.status === "Inactive" ? "inactive" : employee.status === "On probation" ? "probation" : ""}`} />
                  </button>
                ))}
                {visibleEmployees.length === 0 && (
                  <div className="empty-state">No employees match that search.</div>
                )}
              </div>
              <div className="directory-foot">
                <span className="online-dot" /> {employees.filter((employee) => employee.status !== "Inactive").length} active team members
              </div>
            </section>
            <section aria-labelledby="time-tracking-title" className="time-tracking-beta">
              <div className="time-tracking-heading">
                <div>
                  <span className="time-tracking-kicker">BETA</span>
                  <h2 id="time-tracking-title">TDO activity time tracking</h2>
                </div>
                <span className="time-tracking-connection">Not connected</span>
              </div>
              <p className="time-tracking-description">
                Planned: link each employee to their TDO user, use the first sign-in as a draft start, and check for a confirmed break after 15+ minutes without activity.
              </p>
              <div className="time-tracking-prior-day">
                <span>Previous day&apos;s last activity</span>
                <strong>Available after TDO12 API connection</strong>
              </div>
              <p className="time-tracking-note">
                Activity timestamps are estimates, not proof of working time. Drafts need employee and manager review; no payroll or attendance records are created.
              </p>
              {timeTrackingDemo === "idle" ? (
                <button
                  className="time-tracking-preview-button"
                  onClick={() => setTimeTrackingDemo("prompt")}
                  type="button"
                >
                  Preview sample activity
                </button>
              ) : (
                <div className="time-tracking-demo" aria-live="polite">
                  <div className="time-tracking-sample-label">Fictional sample · not TDO data</div>
                  <div className="time-tracking-timestamps">
                    <span><strong>Yesterday</strong> Last activity 4:42 PM</span>
                    <span><strong>Today</strong> First sign-in 8:02 AM</span>
                    <span><strong>Today</strong> Activity gap 11:58 AM–12:31 PM (33 min)</span>
                    <span><strong>Today</strong> Last observed activity 4:43 PM</span>
                  </div>
                  {timeTrackingDemo === "prompt" ? (
                    <div className="time-tracking-prompt">
                      <strong>Was a lunch or break taken during this 33-minute gap?</strong>
                      <div>
                        <button onClick={() => setTimeTrackingDemo("break-confirmed")} type="button">Yes, confirm break</button>
                        <button onClick={() => setTimeTrackingDemo("no-break")} type="button">No break</button>
                      </div>
                    </div>
                  ) : timeTrackingDemo === "break-confirmed" ? (
                    <div className="time-tracking-result" role="status">
                      <strong>Draft segments · break confirmed</strong>
                      <span>Clock-in 8:02 AM → clock-out 11:58 AM</span>
                      <span>Break 11:58 AM–12:31 PM → clock-in 12:31 PM</span>
                      <span>Last activity 4:43 PM → proposed clock-out pending next-day review</span>
                    </div>
                  ) : (
                    <div className="time-tracking-result" role="status">
                      <strong>No break confirmed</strong>
                      <span>Keep one continuous draft for review; do not deduct the gap automatically.</span>
                      <span>Last activity 4:43 PM → proposed clock-out pending next-day review</span>
                    </div>
                  )}
                  <button
                    className="time-tracking-reset"
                    onClick={() => setTimeTrackingDemo("idle")}
                    type="button"
                  >
                    Reset preview
                  </button>
                </div>
              )}
            </section>
            </div>

            {selectedEmployee ? (
              <section className="profile-panel" aria-label={`${selectedEmployee.firstName} ${selectedEmployee.lastName} profile`}>
                <div className="profile-header">
                  <div className="profile-identity">
                    <div className="employee-photo-control">
                      <label className="employee-photo-upload" title="Upload or change employee photo">
                        <span
                          aria-label={selectedEmployee.photoDataUrl ? `${selectedEmployee.firstName} ${selectedEmployee.lastName} photo` : undefined}
                          className={`profile-avatar avatar-${selectedEmployee.id.charCodeAt(0) % 5} ${selectedEmployee.photoDataUrl ? "has-photo" : ""}`}
                          role={selectedEmployee.photoDataUrl ? "img" : undefined}
                          style={selectedEmployee.photoDataUrl ? { backgroundImage: `url("${selectedEmployee.photoDataUrl}")` } : undefined}
                        >
                          {!selectedEmployee.photoDataUrl && initials(selectedEmployee)}
                          <span className="photo-upload-indicator" aria-hidden="true">+</span>
                        </span>
                        <input
                          accept="image/png,image/jpeg,image/webp"
                          aria-label={`Upload photo for ${selectedEmployee.firstName} ${selectedEmployee.lastName}`}
                          onChange={handleEmployeePhotoUpload}
                          type="file"
                        />
                      </label>
                      {selectedEmployee.photoDataUrl && (
                        <button
                          aria-label={`Remove ${selectedEmployee.firstName} ${selectedEmployee.lastName} photo`}
                          className="photo-remove-button"
                          onClick={removeEmployeePhoto}
                          title="Remove photo"
                          type="button"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div>
                      <div className="profile-name-line">
                        <h2>{selectedEmployee.firstName} {selectedEmployee.lastName}</h2>
                        <span className={`status-label ${selectedEmployee.status === "Inactive" ? "status-inactive" : selectedEmployee.status === "On probation" ? "status-probation" : ""}`}>
                          <i /> {selectedEmployee.status}
                        </span>
                      </div>
                      <p>{selectedEmployee.title} <span className="employment-type-badge">{selectedEmployee.employmentType}</span><span>·</span> Joined {displayDate(selectedEmployee.hireDate)}</p>
                    </div>
                  </div>
                  <button className="more-button profile-more" type="button" aria-label="Employee actions">···</button>
                </div>
                {photoNotice && (
                  <div className="photo-notice" role="status">
                    <span>{photoNotice}</span>
                    <button aria-label="Dismiss photo message" onClick={() => setPhotoNotice("")} type="button">×</button>
                  </div>
                )}

                <div className="profile-tabs" role="tablist" aria-label="Employee details">
                  {tabs.map((tab) => (
                    <button
                      aria-selected={activeTab === tab}
                      className={`profile-tab ${activeTab === tab ? "active" : ""}`}
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab);
                        setAuditMessage("");
                      }}
                      role="tab"
                      type="button"
                    >
                      {tab}
                      {tab === "Disciplinary" && selectedEmployee.notes.length > 0 && <span className="tab-count">{selectedEmployee.notes.length}</span>}
                    </button>
                  ))}
                </div>

                <div className="tab-content" role="tabpanel">
                  {activeTab === "Contact" && (
                    <div className="tab-section">
                      <SectionHeading title="Contact information" subtitle="Personal details and ways to get in touch." />
                      <div className="info-grid">
                        <EditableInfoItem label="EMAIL ADDRESS" value={selectedEmployee.email} icon="✉" onChange={(email) => updateEmployee({ email })} type="email" />
                        <EditableInfoItem label="PHONE NUMBER" value={selectedEmployee.phone} icon="⌕" onChange={(phone) => updateEmployee({ phone })} type="tel" />
                        <EditableInfoItem label="HOME ADDRESS" value={selectedEmployee.address} icon="⌂" onChange={(address) => updateEmployee({ address })} />
                      </div>
                      <div className="info-note"><span>✦</span> {mode === "live" ? "Changes are saved to your practice database." : "Edit details inline. Demo changes are not saved."}</div>
                    </div>
                  )}

                  {activeTab === "Employment" && (
                    <div className="tab-section">
                      <SectionHeading title="Employment details" subtitle="Role, milestones, and upcoming check-ins." />
                      <div className="info-grid">
                        <div className="info-item">
                          <span className="info-icon">✳</span>
                          <div><span className="field-label">JOB TITLE</span><input className="inline-input" aria-label="Job title" onChange={(event) => updateEmployee({ title: event.target.value })} value={selectedEmployee.title} /></div>
                        </div>
                        <div className="info-item">
                          <span className="info-icon">◷</span>
                          <div><label className="field-label" htmlFor="employment-type">EMPLOYMENT TYPE</label><select className="inline-input" id="employment-type" onChange={(event) => updateEmployee({ employmentType: event.target.value === "PT" ? "PT" : "FT" })} value={selectedEmployee.employmentType}><option value="FT">Full-time (FT)</option><option value="PT">Part-time (PT)</option></select></div>
                        </div>
                        <EditableInfoItem label="HIRE DATE" value={selectedEmployee.hireDate} icon="▦" onChange={(hireDate) => updateEmployee({ hireDate })} type="date" />
                        <EditableInfoItem label="LAST RAISE" value={selectedEmployee.lastRaise} icon="↗" onChange={(lastRaise) => updateEmployee({ lastRaise })} type="date" />
                      </div>
                      <div className="section-divider" />
                      <div className="section-subheading"><div><h3>Milestones</h3><p>Keep important dates on your radar.</p></div><span className="calendar-mark">▦</span></div>
                      <div className="milestone-list">
                        <EditableMilestone label="Probation ends" value={selectedEmployee.probationEnd} detail={selectedEmployee.status === "On probation" ? "In progress" : "Optional"} tone={selectedEmployee.status === "On probation" ? "amber" : ""} onChange={(probationEnd) => updateEmployee({ probationEnd, status: getProbationStatus(probationEnd) })} />
                        <EditableMilestone label="Next performance review" value={selectedEmployee.nextReview} detail="Reminder date" tone="blue" onChange={(nextReview) => updateEmployee({ nextReview })} />
                      </div>
                      <div className="reminder-note"><span>◷</span><p><strong>Review reminder</strong> — the date is editable here; notifications are not active until a reminder service is connected.</p></div>
                      <div className="background-check-card">
                        <span className="check-shield">✓</span>
                        <div>
                          <strong>Background check</strong>
                          <p>
                            {practiceSettings.backgroundSearchProvider === "none"
                              ? "No search option selected in practice settings."
                              : `${getBackgroundSearchProviderName(practiceSettings.backgroundSearchProvider)} selected · not connected`}
                          </p>
                        </div>
                        <span className="coming-soon">
                          {practiceSettings.backgroundSearchProvider === "none" ? "NOT CONFIGURED" : "NOT CONNECTED"}
                        </span>
                      </div>
                      {practiceSettings.backgroundSearchProvider === "local-court" && (
                        <div className="settings-note">Local state or county court searches are manual only. Employee Hub does not search court records or provide legal guidance.</div>
                      )}
                      <form className="termination-form" onSubmit={recordTermination}>
                        <div><strong>Employment status</strong><p>{selectedEmployee.terminationDate ? `Termination date: ${displayDate(selectedEmployee.terminationDate)}. ` : ""}This prototype does not update TDO.</p></div>
                        <label className="date-control">Termination date<input aria-label="Termination date" name="terminationDate" required type="date" /></label>
                        <button className="danger-button" disabled={selectedEmployee.status === "Inactive"} type="submit">Record termination</button>
                      </form>
                    </div>
                  )}

                  {activeTab === "Benefits" && (
                    <div className="tab-section">
                      <SectionHeading title="Employee benefits" subtitle="Select the benefits that apply to this employee." />
                      {practiceSettings.benefits.length > 0 ? (
                        <div className="benefit-options">
                          {practiceSettings.benefits.map((benefit) => {
                            const isSelected = selectedEmployee.benefits.includes(benefit);
                            return (
                              <label className={`benefit-option ${isSelected ? "selected" : ""}`} key={benefit}>
                                <input
                                  checked={isSelected}
                                  onChange={(event) => {
                                    const nextBenefits = event.target.checked
                                      ? [...selectedEmployee.benefits, benefit]
                                      : selectedEmployee.benefits.filter((item) => item !== benefit);
                                    updateEmployee({ benefits: nextBenefits });
                                  }}
                                  type="checkbox"
                                />
                                <span className="benefit-check" aria-hidden="true">{isSelected ? "✓" : ""}</span>
                                <span className="benefit-option-copy"><strong>{benefit}</strong><small>{isSelected ? "Included for this employee" : "Not currently selected"}</small></span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="empty-card"><span className="empty-card-icon">＋</span><strong>No benefits configured</strong><p>Add benefit options in Practice settings to assign them here.</p></div>
                      )}
                      <div className="settings-note benefit-note">Manage the practice benefit list from the account menu → Practice settings. {mode === "live" ? "Assignments are saved to your practice database." : "Demo assignments are not saved after refresh."}</div>
                    </div>
                  )}

                  {activeTab === "Disciplinary" && (
                    <div className="tab-section">
                      <div className="section-heading-row">
                        <SectionHeading title="Disciplinary log" subtitle="A confidential record of documented conversations." />
                        <button className="secondary-button" onClick={() => setShowDisciplinaryForm(!showDisciplinaryForm)} type="button">＋ Add entry</button>
                      </div>
                      {showDisciplinaryForm && (
                        <form className="entry-form" onSubmit={addDisciplinaryNote}>
                          <div className="form-row">
                            <label>Entry type<select name="type"><option>Coaching conversation</option><option>Written warning</option><option>Performance note</option></select></label>
                            <label>Date<input name="date" required type="date" /></label>
                          </div>
                          <label>Details<textarea name="detail" minLength={3} placeholder="Record factual details and next steps..." required rows={3} /></label>
                          <div className="form-actions"><button className="text-button" onClick={() => setShowDisciplinaryForm(false)} type="button">Cancel</button><button className="primary-button" type="submit">Add to log</button></div>
                        </form>
                      )}
                      {selectedEmployee.notes.length === 0 ? (
                        <div className="empty-card"><span className="empty-card-icon">▤</span><strong>No entries yet</strong><p>Documented conversations will appear here.</p></div>
                      ) : (
                        <div className="note-list">
                          {[...selectedEmployee.notes].sort((a, b) => b.date.localeCompare(a.date)).map((note, index) => (
                            <article className="note-card" key={`${note.date}-${index}`}><div className="note-date">{displayDate(note.date)}</div><h3>{note.type}</h3><p>{note.detail}</p></article>
                          ))}
                        </div>
                      )}
                      <div className="privacy-callout"><span>♧</span><p><strong>Handle with care</strong> — disciplinary records are sensitive employment information. Limit access and retain only what your policies and applicable laws permit.</p></div>
                    </div>
                  )}

                  {activeTab === "Audit log" && (
                    <div className="tab-section">
                      <SectionHeading title="TDO audit review" subtitle="Request an audit activity summary for a selected period." />
                      <form className="audit-form" onSubmit={requestAudit}>
                        <div className="form-row">
                          <label>Start date<input name="startDate" required type="date" /></label>
                          <label>End date<input name="endDate" required type="date" /></label>
                        </div>
                        <div className="audit-info"><span>i</span><p>When connected, the review will surface activity for a manager to examine. It will not determine whether an action was improper.</p></div>
                        <button className="primary-button" type="submit">Request audit summary <span>→</span></button>
                      </form>
                      {auditMessage && <div className="integration-message" role="status">{auditMessage}</div>}
                      <div className="integration-card">
                        <span className="integration-symbol">↗</span>
                        <div><strong>Connect your TDO account</strong><p>Integration is not configured. No employee activity is being accessed.</p></div>
                        <span className="coming-soon">NOT CONNECTED</span>
                      </div>
                      <div className="audit-boundary"><strong>Human review, always.</strong> Activity summaries can help identify records for follow-up, but they are not findings of misconduct. Confirm context in TDO before taking action.</div>
                    </div>
                  )}
                </div>
                <div className="profile-footer"><span>{mode === "live" ? "Practice employee record" : "Sample profile · Demo data only"}</span><span>{mode === "live" ? "Changes saved to Supabase" : "Changes are not saved"}</span></div>
              </section>
            ) : (
              <section className="profile-panel no-selection"><strong>No employees found</strong><p>Try a different search or add an employee.</p></section>
            )}
          </div>
          <footer className="page-footer"><span>Employee Hub <i>·</i> Built for people-first practices</span><span>Sample data only</span></footer>
        </div>
      </main>

      {showAddEmployee && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddEmployee(false); }}>
          <form className="modal-card" onSubmit={addEmployee}>
            <div className="modal-heading"><div><span className="eyebrow">NEW TEAM MEMBER</span><h2>Add employee</h2></div><button className="close-button" onClick={() => setShowAddEmployee(false)} type="button" aria-label="Close">×</button></div>
            <p className="modal-subtitle">Add a sample profile to explore the directory.</p>
            <div className="form-row">
              <label>First name<input autoFocus name="firstName" required /></label>
              <label>Last name<input name="lastName" required /></label>
            </div>
            <label>Job title<input name="title" placeholder="e.g. Dental Assistant" required /></label>
            <label>Employment type<select defaultValue="FT" name="employmentType"><option value="FT">Full-time (FT)</option><option value="PT">Part-time (PT)</option></select></label>
            <div className="form-row">
              <label>Email<input name="email" type="email" /></label>
              <label>Phone<input name="phone" type="tel" /></label>
            </div>
            <label>Home address<input name="address" /></label>
            <div className="form-row">
              <label>Hire date<input name="hireDate" required type="date" /></label>
              <label>Probation end date<input name="probationEnd" type="date" /></label>
            </div>
            <div className="modal-warning">{mode === "live" ? "Employee records are stored in the connected practice database." : "Demo only: this profile exists in memory and will disappear when you refresh."}</div>
            <div className="form-actions"><button className="text-button" onClick={() => setShowAddEmployee(false)} type="button">Cancel</button><button className="primary-button" type="submit">Add employee</button></div>
          </form>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSettings(false); }}>
          <form aria-labelledby="settings-title" aria-modal="true" className="modal-card settings-card" onSubmit={saveSettings} role="dialog">
            <div className="modal-heading">
              <div><span className="eyebrow">WORKSPACE</span><h2 id="settings-title">Practice settings</h2></div>
              <button aria-label="Close settings" className="close-button" onClick={() => setShowSettings(false)} type="button">×</button>
            </div>
            <p className="modal-subtitle">Update your practice profile and notification contact.</p>
            <label>Practice name<input autoFocus onChange={(event) => setSettingsDraft((current) => ({ ...current, practiceName: event.target.value }))} required value={settingsDraft.practiceName} /></label>
            <div className="settings-logo-row">
              <div className="settings-logo-preview">
                {settingsDraft.logoDataUrl ? (
                  <span aria-label="Practice logo preview" role="img" style={{ backgroundImage: `url("${settingsDraft.logoDataUrl}")` }} />
                ) : (
                  <span className="workspace-icon">{settingsDraft.practiceName.charAt(0).toUpperCase() || "P"}</span>
                )}
              </div>
              <label className="logo-upload">Practice logo<input accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} type="file" /><small>PNG, JPEG, or WebP · up to 1 MB</small></label>
              {settingsDraft.logoDataUrl && <button className="text-button remove-logo" onClick={() => setSettingsDraft((current) => ({ ...current, logoDataUrl: "" }))} type="button">Remove</button>}
            </div>
            <div className="settings-field">
              <div className="settings-section-heading"><div><strong>Locations</strong><small>Manage the practice locations in this workspace.</small></div></div>
              <div className="location-list">
                {settingsDraft.locations.map((location, index) => (
                  <div className="location-row" key={`${index}-${location}`}>
                    <input aria-label={`Location ${index + 1}`} onChange={(event) => setSettingsDraft((current) => ({ ...current, locations: current.locations.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} required value={location} />
                    <button aria-label={`Remove ${location || `location ${index + 1}`}`} className="remove-location" disabled={settingsDraft.locations.length <= 1} onClick={() => setSettingsDraft((current) => ({ ...current, locations: current.locations.filter((_, itemIndex) => itemIndex !== index) }))} type="button">×</button>
                  </div>
                ))}
              </div>
              <div className="add-location-row">
                <input aria-label="New location name" onChange={(event) => setNewLocation(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLocation(); } }} placeholder="Add a location" value={newLocation} />
                <button className="secondary-button" onClick={addLocation} type="button">＋ Add</button>
              </div>
            </div>
            <div className="settings-field">
              <div className="settings-section-heading"><div><strong>Available benefits</strong><small>These options appear in each employee&apos;s Benefits tab.</small></div></div>
              <div className="location-list">
                {settingsDraft.benefits.map((benefit, index) => (
                  <div className="location-row" key={`${index}-${benefit}`}>
                    <input aria-label={`Benefit ${index + 1}`} onChange={(event) => setSettingsDraft((current) => ({ ...current, benefits: current.benefits.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} required value={benefit} />
                    <button aria-label={`Remove ${benefit}`} className="remove-location" onClick={() => setSettingsDraft((current) => ({ ...current, benefits: current.benefits.filter((_, itemIndex) => itemIndex !== index) }))} type="button">×</button>
                  </div>
                ))}
              </div>
              <div className="add-location-row">
                <input aria-label="New benefit name" onChange={(event) => setNewBenefit(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addBenefit(); } }} placeholder="Add a benefit (e.g. vision)" value={newBenefit} />
                <button className="secondary-button" onClick={addBenefit} type="button">＋ Add</button>
              </div>
            </div>
            <fieldset className="settings-field provider-settings">
              <legend>Background search option</legend>
              <p className="provider-settings-description">Choose the service or manual workflow your practice plans to use. This only records your preference; no searches are run.</p>
              <div className="provider-options" role="radiogroup" aria-label="Background search provider">
                {([
                  ["none", "Not selected", "Choose a provider later."],
                  ["checkr", "Checkr", "Third-party screening provider."],
                  ["goodhire", "GoodHire", "Third-party screening provider."],
                  ["local-court", "Local state or county court search", "Manual search; no integration."],
                ] as const).map(([value, name, description]) => (
                  <label className={`provider-option ${settingsDraft.backgroundSearchProvider === value ? "selected" : ""}`} key={value}>
                    <input
                      checked={settingsDraft.backgroundSearchProvider === value}
                      name="backgroundSearchProvider"
                      onChange={() => setSettingsDraft((current) => ({ ...current, backgroundSearchProvider: value }))}
                      type="radio"
                      value={value}
                    />
                    <span className="provider-radio" aria-hidden="true" />
                    <span className="provider-option-copy"><strong>{name}</strong><small>{description}</small></span>
                  </label>
                ))}
              </div>
              <p className="provider-settings-note">Provider connection, candidate authorization, and any required compliance steps must be completed before using a screening service. Never enter an API key here.</p>
            </fieldset>
            <label>Admin notification email<input autoComplete="email" placeholder="admin@example.com" type="email" value={settingsDraft.notificationEmail} onChange={(event) => setSettingsDraft((current) => ({ ...current, notificationEmail: event.target.value }))} /></label>
            <div className="settings-note">{mode === "live" ? "Notification delivery is not connected. Settings are shared with authorized members of this practice." : "Notification delivery is not connected yet. These settings are saved only in this browser."}</div>
            {settingsNotice && <div className="settings-error" role="alert">{settingsNotice}</div>}
            <div className="form-actions"><button className="text-button" onClick={() => setShowSettings(false)} type="button">Cancel</button><button className="primary-button" type="submit">Save settings</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="section-heading"><h2>{title}</h2><p>{subtitle}</p></div>;
}

function getBackgroundSearchProviderName(provider: BackgroundSearchProvider) {
  switch (provider) {
    case "checkr":
      return "Checkr";
    case "goodhire":
      return "GoodHire";
    case "local-court":
      return "Local state or county court search";
    case "none":
      return "Not selected";
  }
}

function EditableInfoItem({ label, value, icon, onChange, type = "text" }: { label: string; value: string; icon: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="info-item">
      <span className="info-icon">{icon}</span>
      <div><label className="field-label">{label}</label><input aria-label={label} className="inline-input" onChange={(event) => onChange(event.target.value)} placeholder={type === "date" ? "" : "Not set"} type={type} value={value} /></div>
    </div>
  );
}

function EditableMilestone({ label, value, detail, tone = "", onChange }: { label: string; value: string; detail: string; tone?: string; onChange: (value: string) => void }) {
  return (
    <div className="milestone-row">
      <span className={`milestone-icon ${tone}`}>▦</span>
      <label className="milestone-copy"><strong>{label}</strong><input aria-label={label} onChange={(event) => onChange(event.target.value)} type="date" value={value} /></label>
      <span className={`milestone-tag ${tone}`}>{detail}</span>
    </div>
  );
}
