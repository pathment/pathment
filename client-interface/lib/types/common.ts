// Notification Types
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: string;
}

export type NotificationType = 
  | 'match_confirmed'
  | 'task_assigned'
  | 'task_submitted'
  | 'feedback_received'
  | 'deadline_reminder'
  | 'program_update'
  | 'system_message';

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Common UI Types
export interface SelectOption {
  label: string;
  value: string;
}

export interface TableColumn<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
}

export interface FilterOption {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'date' | 'text';
  options?: SelectOption[];
}
