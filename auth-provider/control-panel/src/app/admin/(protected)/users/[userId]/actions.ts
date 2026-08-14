'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { fetchAdminApi, readAdminErrorCode } from '@/lib/admin-api';
import { getCurrentAdminSession } from '@/lib/admin-session';

type UserProfileField = 'name' | 'email';
type UserStatus = 'ACTIVE' | 'INACTIVE';
type PasswordField = 'password' | 'confirmPassword';

export interface UpdateUserActionState {
  error: string | null;
  fieldErrors: Partial<Record<UserProfileField, string>>;
}

export interface UpdateUserStatusActionState {
  error: string | null;
}

export interface UpdateUserPasswordActionState {
  error: string | null;
  fieldErrors: Partial<Record<PasswordField, string>>;
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

export async function updateUserStatusAction(
  userId: string,
  nextStatus: UserStatus,
  previousState: UpdateUserStatusActionState,
  formData: FormData,
): Promise<UpdateUserStatusActionState> {
  void previousState;
  void formData;

  if (nextStatus !== 'ACTIVE' && nextStatus !== 'INACTIVE') {
    return { error: 'Status tujuan tidak valid.' };
  }

  const currentSession = await getCurrentAdminSession();

  if (!currentSession) {
    redirect('/admin/login?error=session_required');
  }

  if (nextStatus === 'INACTIVE' && currentSession.user.id === userId) {
    return {
      error: 'Akun admin yang sedang digunakan tidak dapat dinonaktifkan sendiri.',
    };
  }

  let response: Response;

  try {
    response = await fetchAdminApi(`/admin/users/${encodeURIComponent(userId)}/status`, {
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
    const code = await readAdminErrorCode(response);

    return {
      error:
        code === 'USER_NOT_FOUND'
          ? 'Pengguna tidak lagi ditemukan.'
          : 'Status pengguna belum dapat diperbarui. Silakan coba lagi.',
    };
  }

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);
  const result = nextStatus === 'INACTIVE' ? 'deactivated' : 'activated';
  redirect(`/admin/users/${encodeURIComponent(userId)}?status=${result}`);
}

export async function updateUserPasswordAction(
  userId: string,
  previousState: UpdateUserPasswordActionState,
  formData: FormData,
): Promise<UpdateUserPasswordActionState> {
  void previousState;

  const passwordValue = formData.get('password');
  const confirmationValue = formData.get('confirmPassword');
  const password = typeof passwordValue === 'string' ? passwordValue : '';
  const confirmation = typeof confirmationValue === 'string' ? confirmationValue : '';
  const fieldErrors: UpdateUserPasswordActionState['fieldErrors'] = {};

  if (password.length < 8 || password.length > 1024) {
    fieldErrors.password = 'Password harus terdiri dari 8–1024 karakter.';
  }
  if (confirmation !== password) {
    fieldErrors.confirmPassword = 'Konfirmasi password tidak sama.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: 'Password belum dapat diperbarui.',
      fieldErrors,
    };
  }

  const currentSession = await getCurrentAdminSession();

  if (!currentSession) {
    redirect('/admin/login?error=session_required');
  }

  let response: Response;

  try {
    response = await fetchAdminApi(`/admin/users/${encodeURIComponent(userId)}/password`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
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
        code === 'USER_NOT_FOUND'
          ? 'Pengguna tidak lagi ditemukan.'
          : response.status === 400
            ? 'Password tidak memenuhi aturan Auth Server.'
            : 'Password belum dapat diperbarui. Silakan coba lagi.',
      fieldErrors: {},
    };
  }

  revalidatePath(`/admin/users/${userId}`);

  if (currentSession.user.id === userId) {
    redirect('/admin/login?notice=password_changed');
  }

  redirect(`/admin/users/${encodeURIComponent(userId)}?password=changed`);
}
