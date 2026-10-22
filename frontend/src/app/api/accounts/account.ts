export interface ClientAccount {
  accountId: string;
  accountName: string;
  accountType: string;
  cashBalance: number;
  suspended: boolean;
  deactivated: boolean;
  updatedAt: string;
}

export interface AccountDeletionEligibility {
  cashEmpty: boolean;
  activeOrdersEmpty: boolean;
  holdingsEmpty: boolean;
}
