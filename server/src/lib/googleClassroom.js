import { google } from 'googleapis';
import { getAuthorizedClient } from './googleAuth.js';
import { AppError } from './errors.js';

const DEFAULT_HORIZON_DAYS = 14;

function wrapGoogleError(err) {
  const status = err?.response?.status || err?.code;
  if (status === 401) return new AppError('GOOGLE_REAUTH_REQUIRED', 'Your Google connection expired — reconnect to continue.', 401);
  if (status === 403) return new AppError('GOOGLE_SCOPE_MISSING', 'Google Classroom access was not granted.', 403);
  return new AppError('UPSTREAM_ERROR', 'Google Classroom request failed.', 502);
}

function toDueDate(dueDate, dueTime) {
  if (!dueDate) return null;
  const { year, month, day } = dueDate;
  const hours = dueTime?.hours ?? 23;
  const minutes = dueTime?.minutes ?? 59;
  return new Date(Date.UTC(year, month - 1, day, hours, minutes)).toISOString();
}

/** Lists coursework due within `withinDays` across the user's active courses. */
export async function listCourseworkDueSoon(userId, withinDays = DEFAULT_HORIZON_DAYS) {
  const auth = await getAuthorizedClient(userId);
  const classroom = google.classroom({ version: 'v1', auth });
  const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);

  try {
    const coursesRes = await classroom.courses.list({ courseStates: ['ACTIVE'], studentId: 'me' });
    const courses = coursesRes.data.courses || [];

    const perCourse = await Promise.all(courses.map(async (course) => {
      const courseworkRes = await classroom.courses.courseWork.list({ courseId: course.id, courseWorkStates: ['PUBLISHED'] });
      return (courseworkRes.data.courseWork || []).map((cw) => ({
        courseId: course.id,
        courseworkId: cw.id,
        title: cw.title,
        courseName: course.name,
        dueDate: toDueDate(cw.dueDate, cw.dueTime),
      }));
    }));

    return perCourse
      .flat()
      .filter((cw) => cw.dueDate && new Date(cw.dueDate) <= horizon && new Date(cw.dueDate) > new Date());
  } catch (err) {
    throw wrapGoogleError(err);
  }
}
