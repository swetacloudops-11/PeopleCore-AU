import { employeeContext } from "@/lib/employee";
import { PageHeader } from "@/components/ui";
import TimesheetForm from "./TimesheetForm";

export default async function NewTimesheetPage() {
  const { employee, org } = await employeeContext();

  return (
    <div>
      <PageHeader
        title="Submit a timesheet"
        subtitle={`Pick a week and enter your hours · ${employee.firstName} ${employee.lastName} (${employee.employeeNumber}) · ${org.name}`}
      />
      <TimesheetForm />
    </div>
  );
}
