const jobName = process.argv[2];

if (!jobName) {
  console.error("Missing job name.");
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "phase_1_placeholder",
      job: jobName,
      detail:
        "Job entrypoint exists. Real job behavior starts in later phases.",
    },
    null,
    2,
  ),
);
