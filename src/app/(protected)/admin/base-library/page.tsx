import { redirect } from "next/navigation";
import { BaseLibraryAdmin } from "@/components/fit/base-library-admin";
import { createClient } from "@/lib/supabase/server";

export default async function BaseLibraryAdminPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const serviceKeySet = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const replicateSet = Boolean(process.env.REPLICATE_API_TOKEN);
  const canGenerate = serviceKeySet && replicateSet;

  return (
    <main className="page-shell">
      <div className="section-kicker">Admin</div>
      <div className="fitting-heading">
        <div>
          <h1>Base Mannequin Library</h1>
          <p>
            Generate a full-body mannequin for each slot on demand, or upload your own.
            The try-on model uses these as the base body. Uploads accept PNG, JPEG, or
            WebP under 15 MB.
          </p>
        </div>
      </div>

      {!serviceKeySet && (
        <div className="base-admin-warning">
          <strong>SUPABASE_SERVICE_ROLE_KEY is not set.</strong> Add it to{" "}
          <code>.env.local</code> to enable uploads and generation. Find it under{" "}
          <strong>Settings › API › service_role</strong> in Supabase.
        </div>
      )}
      {serviceKeySet && !replicateSet && (
        <div className="base-admin-warning">
          <strong>REPLICATE_API_TOKEN is not set.</strong> Add it to <code>.env.local</code>{" "}
          to enable on-demand generation. You can still upload images manually.
        </div>
      )}

      <div className="rule" />
      <BaseLibraryAdmin canGenerate={canGenerate} />
    </main>
  );
}
