'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { fetchAdminApi, readAdminErrorCode } from '@/lib/admin-api';

type UserProfileField = 'name' | 'email';

export interface UpdateUserActionState {
  error: string | null;
  fieldErrors: Partial<Record<UserProfileField, string>>;
}

function readString(formData: FormData, name: UserProfileField): string {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
}

export async function updateUserAction(
  userId: string,
  previousState: UpdateUserActionState,
  formData: FormData,
): Promise<UpdateUserActionState> {
  void previousState;

  const name = readString(formData, 'name').trim();
  const email = readString(formData, 'email').trim().toLowerCase();
  const fieldErrors: UpdateUserActionState['fieldErrors'] = {};

  if (name.length === 0 || name.length > 120) {
    fieldErrors.name = 'Nama wajib diisi dan maksimal 120 karakter.';
  }
  if (email.length === 0 || email.length > 320) {
    fieldErrors.email = 'Email wajib diisi dan maksimal 320 karakter.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: 'Periksa kembali profil pengguna yang diisi.',
      fieldErrors,
    };
  }

  let response: Response;

  try {
    response = await fetchAdminApi(`/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email }),
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

    if (code === 'EMAIL_ALREADY_EXISTS') {
      return {
        error: 'Profil pengguna belum dapat diperbarui.',
        fieldErrors: { email: 'Email sudah digunakan oleh pengguna lain.' },
      };
    }
    if (code === 'USER_NOT_FOUND') {
      return {
        error: 'Pengguna tidak lagi ditemukan. Kembali ke daftar pengguna.',
        fieldErrors: {},
      };
    }

    return {
      error:
        response.status === 400
          ? 'Data profil tidak valid. Periksa kembali seluruh field.'
          : 'Profil pengguna belum dapat diperbarui. Silakan coba lagi.',
      fieldErrors: {},
    };
  }

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
  redirect(`/admin/users/${encodeURIComponent(userId)}?updated=1`);
}
