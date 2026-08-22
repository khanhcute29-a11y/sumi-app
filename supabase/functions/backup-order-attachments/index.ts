import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const required = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const supabase = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));
    const clientId = required("GOOGLE_DRIVE_CLIENT_ID");
    const clientSecret = required("GOOGLE_DRIVE_CLIENT_SECRET");
    const refreshToken = required("GOOGLE_DRIVE_REFRESH_TOKEN");
    const normalFolder = required("GOOGLE_DRIVE_BACKUP_FOLDER_ID");
    const schoolFolder = required("GOOGLE_DRIVE_SCHOOL_FOLDER_ID");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    });
    if (!tokenResponse.ok) throw new Error(`Drive token failed: ${tokenResponse.status}`);
    const { access_token } = await tokenResponse.json();

    const { data: rows, error } = await supabase.from("attachments_due_for_backup").select("*").limit(20);
    if (error) throw error;
    let verified = 0;
    for (const row of rows ?? []) {
      try {
        await supabase.from("order_attachments").update({ backup_status: "processing" }).eq("id", row.id);
        const source = row.storage_path
          ? await supabase.storage.from("uploads").download(row.storage_path)
          : await fetch(row.legacy_storage_url).then(async r => { if (!r.ok) throw new Error(`source ${r.status}`); return { data: await r.blob() }; });
        if (!source.data) throw new Error("Attachment source is empty");
        const folderId = row.confidentiality === "school_restricted" ? schoolFolder : normalFolder;
        const metadata = { name: `${row.order_code || row.order_id}-${row.id}`, parents: [folderId] };
        const form = new FormData();
        form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
        form.append("file", source.data);
        const upload = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,size,md5Checksum", {
          method: "POST", headers: { authorization: `Bearer ${access_token}` }, body: form,
        });
        if (!upload.ok) throw new Error(`Drive upload failed: ${upload.status}`);
        const drive = await upload.json();
        if (row.size_bytes && Number(drive.size) !== Number(row.size_bytes)) throw new Error("Backup size mismatch");
        await supabase.from("order_attachments").update({ backup_status: "verified", drive_file_id: drive.id,
          backup_checksum: drive.md5Checksum ?? null, backed_up_at: new Date().toISOString() }).eq("id", row.id);
        await supabase.from("attachment_backup_attempts").insert({ attachment_id: row.id, status: "verified", drive_file_id: drive.id, checksum: drive.md5Checksum ?? null });
        verified++;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await supabase.from("order_attachments").update({ backup_status: "failed" }).eq("id", row.id);
        await supabase.from("attachment_backup_attempts").insert({ attachment_id: row.id, status: "failed", error_message: message });
      }
    }
    return Response.json({ scanned: rows?.length ?? 0, verified });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
