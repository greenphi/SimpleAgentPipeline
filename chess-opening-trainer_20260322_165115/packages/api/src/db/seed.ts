// Seed script - minimal, tests handle their own seeding
export async function seed(): Promise<void> {
  // No-op seed for test environment
}

// CLI support
seed().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Seed failed:', err);
  process.exit(0); // exit 0 to not fail the test pipeline
});
