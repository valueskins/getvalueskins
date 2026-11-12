CREATE TABLE "job_runs" (
	"job_name" varchar(64) PRIMARY KEY NOT NULL,
	"last_success_at" timestamp with time zone NOT NULL
);
