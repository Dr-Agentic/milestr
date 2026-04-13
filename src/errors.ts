export class DashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DashboardError';
  }
}

export class ValidationError extends DashboardError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends DashboardError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends DashboardError {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class LockError extends DashboardError {
  constructor(message: string) {
    super(message);
    this.name = 'LockError';
  }
}

export class CliError extends DashboardError {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}
