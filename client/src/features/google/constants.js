export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Tasks and Classroom are "sensitive"/restricted scopes — Google requires an
// app verification review before granting them beyond a handful of test
// users. Budget lead time for that review before relying on this in
// production; test users can authorize immediately in the meantime.
export const GOOGLE_TASKS_SCOPE = 'https://www.googleapis.com/auth/tasks.readonly';
export const GOOGLE_CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
];

export const ALL_GOOGLE_SCOPES = [GOOGLE_CALENDAR_SCOPE, GOOGLE_TASKS_SCOPE, ...GOOGLE_CLASSROOM_SCOPES].join(' ');
