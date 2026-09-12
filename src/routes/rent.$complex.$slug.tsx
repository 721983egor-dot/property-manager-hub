import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { getPublicProperty } from "@/lib/public-property.functions";
import { propertySlug } from "@/lib/seo";

/**
 * Старые адреса вида /rent/lazurbereg2/lbdvastudiasterrasoi.
 * Ищем объект по source_url и отдаём 301 на канонический slug.
 */
export const Route = createFileRoute("/rent/$complex/$slug")({
  loader: async ({ params }) => {
    if (params.complex.toLowerCase() === "jk") throw notFound();
    const property = await getPublicProperty({ data: { id: `${params.complex}/${params.slug}` } });
    if (!property) throw notFound();
    throw redirect({
      to: "/rent/$id",
      params: { id: propertySlug(property) },
      replace: true,
      statusCode: 301,
    });
  },
});
