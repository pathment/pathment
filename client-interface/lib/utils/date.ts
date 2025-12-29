import { format, formatDistance, formatRelative, isAfter, isBefore, parseISO } from 'date-fns';

export const formatDate = (date: string | Date, formatStr: string = 'PPP'): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return format(dateObj, formatStr);
};

export const formatDateTime = (date: string | Date): string => {
  return formatDate(date, 'PPP p');
};

export const formatRelativeTime = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatDistance(dateObj, new Date(), { addSuffix: true });
};

export const formatRelativeDate = (date: string | Date): string => {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return formatRelative(dateObj, new Date());
};

export const isDeadlinePassed = (deadline: string | Date): boolean => {
  const deadlineDate = typeof deadline === 'string' ? parseISO(deadline) : deadline;
  return isBefore(deadlineDate, new Date());
};

export const isDeadlineUpcoming = (deadline: string | Date, daysThreshold: number = 3): boolean => {
  const deadlineDate = typeof deadline === 'string' ? parseISO(deadline) : deadline;
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);
  
  return isAfter(deadlineDate, new Date()) && isBefore(deadlineDate, thresholdDate);
};

export const calculateDaysUntilDeadline = (deadline: string | Date): number => {
  const deadlineDate = typeof deadline === 'string' ? parseISO(deadline) : deadline;
  const now = new Date();
  const diffTime = deadlineDate.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
