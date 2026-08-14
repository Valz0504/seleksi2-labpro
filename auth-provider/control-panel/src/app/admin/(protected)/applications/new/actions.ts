'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { fetchAdminApi, readAdminErrorCode } from '@/lib/admin-api';

type ApplicationField =
  'name' | 'clientId' | 'redirectUris' | 'launchUrl' | 'logoutNotificationUrl';

export interface CreatedApplicationCredential {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
}

export interface CreateApplicationActionState {
  error: string | null;
  fieldErrors: Partial<Record<ApplicationField, string>>;
  createdApplication: CreatedApplicationCredential | null;
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

function readRedirectUris(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((redirectUri) => redirectUri.trim())
    .filter(Boolean);
}

export async function createApplicationAction(
  previousState: CreateApplicationActionState,
  formData: FormData,
): Promise<CreateApplicationActionState> {
  void previousState;

  const name = readString(formData, 'name').trim();
  const clientId = readString(formData, 'clientId').trim();
  const redirectUris = readRedirectUris(readString(formData, 'redirectUris'));
  const launchUrl = readString(formData, 'launchUrl').trim();
  const logoutNotificationUrl = readString(formData, 'logoutNotificationUrl').trim();
  const fieldErrors: CreateApplicationActionState['fieldErrors'] = {};

  if (name.length === 0 || name.length > 120) {
    fieldErrors.name = 'Nama application wajib diisi dan maksimal 120 karakter.';
  }
  if (clientId.length < 3 || clientId.length > 100 || !/^[A-Za-z0-9._~-]+$/.test(clientId)) {
    fieldErrors.clientId =
      'Client ID harus 3–100 karakter dan hanya memakai huruf, angka, titik, underscore, tilde, atau tanda hubung.';
  }
  if (redirectUris.length === 0 || redirectUris.length > 20) {
    fieldErrors.redirectUris = 'Masukkan 1–20 redirect URI, masing-masing satu per baris.';
  } else if (new Set(redirectUris).size !== redirectUris.length) {
    fieldErrors.redirectUris = 'Redirect URI tidak boleh duplikat.';
  } else if (redirectUris.some((redirectUri) => !isHttpUrl(redirectUri))) {
    fieldErrors.redirectUris = 'Setiap redirect URI harus berupa URL HTTP/HTTPS yang valid.';
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
      createdApplication: null,
    };
  }

  let response: Response;

  try {
    response = await fetchAdminApi('/admin/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        clientId,
        redirectUris,
        ...(launchUrl ? { launchUrl } : {}),
        logoutNotificationUrl,
      }),
    });
  } catch {
    return {
      error: 'Auth Server tidak dapat dihubungi. Coba lagi setelah service aktif.',
      fieldErrors: {},
      createdApplication: null,
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

    if (code === 'CLIENT_ID_ALREADY_EXISTS') {
      return {
        error: 'Application belum dapat didaftarkan.',
        fieldErrors: { clientId: 'Client ID sudah digunakan application lain.' },
        createdApplication: null,
      };
    }

    return {
      error:
        response.status === 400
          ? 'Konfigurasi application ditolak Auth Server. Periksa kembali seluruh field.'
          : 'Application belum dapat didaftarkan. Silakan coba lagi.',
      fieldErrors: {},
      createdApplication: null,
    };
  }

  const body = (await response.json()) as unknown;

  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body) ||
    typeof body.id !== 'string' ||
    !('clientSecret' in body) ||
    typeof body.clientSecret !== 'string'
  ) {
    return {
      error:
        'Application berhasil dibuat, tetapi client secret tidak diterima dengan benar. Rotate secret sebelum application digunakan.',
      fieldErrors: {},
      createdApplication: null,
    };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/applications');

  return {
    error: null,
    fieldErrors: {},
    createdApplication: {
      id: body.id,
      name,
      clientId,
      clientSecret: body.clientSecret,
      redirectUris,
    },
  };
}
