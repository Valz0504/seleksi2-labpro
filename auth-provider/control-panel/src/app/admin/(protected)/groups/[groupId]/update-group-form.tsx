'use client';

import { useActionState } from 'react';
import { updateGroupAction, type UpdateGroupActionState } from './actions';

const INITIAL_STATE: UpdateGroupActionState = {
  error: null,
  fieldErrors: {},
};

interface UpdateGroupFormProps {
  groupId: string;
  name: string;
  description: string | null;
}

export function UpdateGroupForm({ groupId, name, description }: UpdateGroupFormProps) {
  const actionWithGroup = updateGroupAction.bind(null, groupId);
  const [state, formAction, isPending] = useActionState(actionWithGroup, INITIAL_STATE);

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
        <label className="block text-sm font-bold text-slate-700" htmlFor="group-name">
          Nama group
        </label>
        <input
          className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="group-name"
          name="name"
          type="text"
          defaultValue={name}
          aria-describedby={state.fieldErrors.name ? 'group-name-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.name)}
          maxLength={120}
          required
        />
        {state.fieldErrors.name ? (
          <p className="mt-2 text-sm font-medium text-red-700" id="group-name-error">
            {state.fieldErrors.name}
          </p>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-bold text-slate-700" htmlFor="group-description">
          Deskripsi <span className="font-normal text-slate-400">(opsional)</span>
        </label>
        <textarea
          className="mt-2 min-h-32 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-3 focus:ring-blue-600/15"
          id="group-description"
          name="description"
          defaultValue={description ?? ''}
          aria-describedby={state.fieldErrors.description ? 'group-description-error' : undefined}
          aria-invalid={Boolean(state.fieldErrors.description)}
          maxLength={1000}
        />
        {state.fieldErrors.description ? (
          <p className="mt-2 text-sm font-medium text-red-700" id="group-description-error">
            {state.fieldErrors.description}
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
