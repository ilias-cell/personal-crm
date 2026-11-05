// Shared between the forms (browser) and the server actions, so it must stay free of server-only code.

export const GROUP_NAME_MAX_LENGTH = 40;

export type GroupFormState = {
  // What the user typed, returned back so a failed submit does not wipe the field.
  // After a successful create it is empty; after a rename it is the new name.
  name: string;
  error: string | null;
  // True when the last submit went through: the form can clear itself or close.
  saved: boolean;
};

export const initialGroupFormState: GroupFormState = {
  name: "",
  error: null,
  saved: false,
};

export type DeleteGroupState = {
  error: string | null;
};

export const initialDeleteGroupState: DeleteGroupState = {
  error: null,
};

// The result of a button in the card that adds a person to a group or takes them out.
export type ContactGroupState = {
  error: string | null;
};
