'use client';

import { useActionState } from 'react';
import { updateApplicationAction, type UpdateApplicationActionState } from './actions';

const INITIAL_STATE: UpdateApplicationActionState = {
  error: null,
  fieldErrors: {},
};

interface UpdateApplicationFormProps {
  applicationId: string;
  name: string;
  launchUrl: string | null;
  logoutNotificationUrl: string;
}

export function UpdateApplicationForm({
  applicationId,
  name,
  launchUrl,
  logoutNotificationUrl,
}: UpdateApplicationFormProps) {
  const actionWithApplication = updateApplicationAction.bind(null, applicationId);
  const [state, formAction, isPending] = useActionState(actionWithApplication, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          role="alert"
        >
          {state.error}
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="application-name">
          Nama application
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="application-name"
          name="name"
          type="text"
          defaultValue={name}
          maxLength={120}
          aria-describedby={state.fieldErrors.name ? 'application-name-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.name)}
          required
        />
        {state.fieldErrors.name ? (
          <p className="mt-2 text-sm font-medium text-red-700" id="application-name-error">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="launch-url">
          Launch URL <span className="font-normal text-slate-400">(opsional)</span>
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="launch-url"
          name="launchUrl"
          type="url"
          defaultValue={launchUrl ?? ''}
          maxLength={2048}
          aria-describedby={state.fieldErrors.launchUrl ? 'launch-url-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.launchUrl)}
        />
        {state.fieldErrors.launchUrl ? (
          <p className="mt-2 text-sm font-medium text-red-700" id="launch-url-error">
            {state.fieldErrors.launchUrl}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="logout-notification-url">
          Logout notification URL
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="logout-notification-url"
          name="logoutNotificationUrl"
          type="url"
          defaultValue={logoutNotificationUrl}
          maxLength={2048}
          aria-describedby={
            state.fieldErrors.logoutNotificationUrl
              ? 'logout-notification-url-error logout-notification-url-help'
              : 'logout-notification-url-help'
          }
          aria-invalid={Boolean(state.fieldErrors.logoutNotificationUrl)}
          required
        />
        <p className="mt-2 text-sm leading-6 text-slate-500" id="logout-notification-url-help">
          Endpoint internal wajib untuk back-channel logout application.
        </p>
        {state.fieldErrors.logoutNotificationUrl ? (
          <p className="mt-2 text-sm font-medium text-red-700" id="logout-notification-url-error">
            {state.fieldErrors.logoutNotificationUrl}
          </p>
        ) : null}
      </div>

      <button
        className="h-11 cursor-pointer rounded-lg bg-blue-600 px-5 font-bold text-white transition hover:bg-blue-700 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600/30 disabled:cursor-not-allowed disabled:bg-blue-300"
        type="submit"
        disabled={isPending}
      >
        {isPending ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
    </form>
  );
}
