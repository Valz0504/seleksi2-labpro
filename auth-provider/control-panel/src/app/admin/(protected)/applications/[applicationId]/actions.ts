'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fetchAdminApi, readAdminErrorCode } from '@/lib/admin-api';

type ApplicationField = 'name' | 'launchUrl' | 'logoutNotificationUrl';
type ApplicationStatus = 'ACTIVE' | 'INACTIVE';

export interface UpdateApplicationActionState {
  error: string | null;
  fieldErrors: Partial<Record<ApplicationField, string>>;
}

export interface UpdateApplicationStatusActionState {
  error: string | null;
}

function readString(formData: FormData, name: ApplicationField): string {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
}

function isHttpUrl(value: string): boolean {
  if (value.length === 0 || value.length > 2048) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function revalidateApplicationViews(applicationId: string): void {
  revalidatePath('/admin/applications');
  revalidatePath(`/admin/applications/${applicationId}`);
  revalidatePath('/admin/groups');
}

export async function updateApplicationAction(
  applicationId: string,
  previousState: UpdateApplicationActionState,
  formData: FormData,
): Promise<UpdateApplicationActionState> {
  void previousState;

  const name = readString(formData, 'name').trim();
  const launchUrl = readString(formData, 'launchUrl').trim();
  const logoutNotificationUrl = readString(formData, 'logoutNotificationUrl').trim();
  const fieldErrors: UpdateApplicationActionState['fieldErrors'] = {};

  if (name.length === 0 || name.length > 120) {
    fieldErrors.name = 'Nama application wajib diisi dan maksimal 120 karakter.';
  }
  if (launchUrl && !isHttpUrl(launchUrl)) {
    fieldErrors.launchUrl = 'Launch URL harus berupa URL HTTP/HTTPS yang valid.';
  }
  if (!isHttpUrl(logoutNotificationUrl)) {
    fieldErrors.logoutNotificationUrl =
      'Logout notification URL wajib berupa URL HTTP/HTTPS yang valid.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: 'Periksa kembali konfigurasi application yang diisi.',
      fieldErrors,
    };
  }

  let response: Response;

  try {
    response = await fetchAdminApi(`/admin/applications/${encodeURIComponent(applicationId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        launchUrl: launchUrl || null,
        logoutNotificationUrl,
      }),
    });
  } catch {
    return {
      error: 'Auth Server tidak dapat dihubungi. Coba lagi setelah service aktif.',
      fieldErrors: {},
    };
  }

  if (response.status === 401) {
    redirect('/admin/login?error=session_required');
  }
  if (response.status === 403) {
    redirect('/admin/login?error=admin_required');
  }

  if (!response.ok) {
    const code = await readAdminErrorCode(response);

    return {
      error:
        code === 'APPLICATION_NOT_FOUND'
          ? 'Application tidak lagi ditemukan. Kembali ke daftar application.'
          : response.status === 400
            ? 'Konfigurasi application ditolak Auth Server. Periksa kembali seluruh field.'
            : 'Application belum dapat diperbarui. Silakan coba lagi.',
      fieldErrors: {},
    };
  }

  revalidateApplicationViews(applicationId);
  redirect(`/admin/applications/${encodeURIComponent(applicationId)}?updated=1`);
}

export async function updateApplicationStatusAction(
  applicationId: string,
  nextStatus: ApplicationStatus,
  previousState: UpdateApplicationStatusActionState,
  formData: FormData,
): Promise<UpdateApplicationStatusActionState> {
  void previousState;
  void formData;

  if (nextStatus !== 'ACTIVE' && nextStatus !== 'INACTIVE') {
    return { error: 'Status tujuan tidak valid.' };
  }

  let response: Response;

  try {
    response = await fetchAdminApi(`/admin/applications/${encodeURIComponent(applicationId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
  } catch {
    return { error: 'Auth Server tidak dapat dihubungi. Coba lagi setelah service aktif.' };
  }

  if (response.status === 401) {
    redirect('/admin/login?error=session_required');
  }
  if (response.status === 403) {
    redirect('/admin/login?error=admin_required');
  }

  if (!response.ok) {
    return {
      error:
        (await readAdminErrorCode(response)) === 'APPLICATION_NOT_FOUND'
          ? 'Application tidak lagi ditemukan.'
          : 'Status application belum dapat diperbarui. Silakan coba lagi.',
    };
  }

  revalidateApplicationViews(applicationId);
  const result = nextStatus === 'INACTIVE' ? 'deactivated' : 'activated';
  redirect(`/admin/applications/${encodeURIComponent(applicationId)}?status=${result}`);
}
