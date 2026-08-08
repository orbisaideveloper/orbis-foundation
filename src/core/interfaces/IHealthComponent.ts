export interface IHealthComponent {
  readonly name: string;
  readonly version: string;
  checkHealth(): Promise<boolean>;
}
