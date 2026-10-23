import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, FilterBar, FilterSelect, PageHeader, SampleNote, SearchBox, SectionCard, StatCard, StatGrid } from "@/components/finance/common";
import { useFinance } from "@/finance/store";
import { studentCourse } from "@/finance/courses";
import { formatINR, studentPaid, sum } from "@/finance/logic";

export const Route = createFileRoute("/allocation")({
  head: () => ({ meta: [{ title: "Course Fees — Finance & Accounts" }, { name: "description", content: "Course-wise fees billed, collected and outstanding." }] }),
  component: CourseFeesPage,
});

function CourseFeesPage() {
  const { students, payments, courseCatalog } = useFinance();
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const rows = useMemo(() => courseCatalog.courses.map((course) => {
    const members = students.filter((student) => studentCourse(student, courseCatalog)?.id === course.id);
    const billed = sum(members.map((student) => student.totalFee));
    const collected = sum(members.map((student) => studentPaid(student.id, payments)));
    return { name: course.name, enrolments: members.length, billed, collected, outstanding: Math.max(0, billed - collected) };
  }), [courseCatalog, students, payments]);
  const filtered = rows.filter((row) => (courseFilter === "all" || row.name === courseFilter) && (!query || row.name.toLowerCase().includes(query.toLowerCase())));
  const totals = {
    billed: sum(rows.map((row) => row.billed)),
    collected: sum(rows.map((row) => row.collected)),
    outstanding: sum(rows.map((row) => row.outstanding)),
  };
  const rate = totals.billed ? Math.round(totals.collected / totals.billed * 100) : 0;
  return (
    <>
      <PageHeader crumbs={["Course Fees"]} title="Course Fees" description="Course-wise fees billed, collected and outstanding." />
      <SampleNote />
      <StatGrid className="mb-4">
        <StatCard label="Total fees billed" value={formatINR(totals.billed)} />
        <StatCard label="Fees collected" value={formatINR(totals.collected)} tone="success" />
        <StatCard label="Outstanding fees" value={formatINR(totals.outstanding)} tone="danger" />
        <StatCard label="Collection rate" value={`${rate}%`} />
      </StatGrid>
      <SectionCard title="Course fee summary">
        <FilterBar>
          <SearchBox value={query} onChange={setQuery} placeholder="Search course" />
          <FilterSelect label="Courses" value={courseFilter} onChange={setCourseFilter} options={courseCatalog.courses.map((course) => course.name)} />
        </FilterBar>
        {filtered.length === 0 ? <EmptyState /> : <Table>
          <TableHeader><TableRow><TableHead>Course</TableHead><TableHead className="text-right">Enrolments</TableHead><TableHead className="text-right">Fees billed</TableHead><TableHead className="text-right">Collected</TableHead><TableHead className="text-right">Outstanding</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.map((row) => <TableRow key={row.name}><TableCell className="font-medium">{row.name}</TableCell><TableCell className="num text-right">{row.enrolments}</TableCell><TableCell className="num text-right">{formatINR(row.billed)}</TableCell><TableCell className="num text-right">{formatINR(row.collected)}</TableCell><TableCell className="num text-right">{formatINR(row.outstanding)}</TableCell></TableRow>)}</TableBody>
        </Table>}
      </SectionCard>
    </>
  );
}
