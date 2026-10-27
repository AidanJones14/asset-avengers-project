export interface BankAccount {
  bankAccountId: string;
  bankName: string;
  routingNumber: string;
  maskedAccountNumber: string; // e.g., "****1234"
  createdAt: string;
}
