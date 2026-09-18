import { getCategories } from "../../api";
import { CategoryCard } from "../../ui";

export default async function CategoriesPage() {
  const categories = await getCategories(true).catch(() => []);

  return (
    <div>
      <header className="ns-animate-fade-up mb-6">
        <h1 className="ns-section-title">All Categories</h1>
        <p className="mt-1 text-sm text-gray-500">
          {categories.length} categor{categories.length === 1 ? "y" : "ies"} to explore
        </p>
      </header>

      {categories.length === 0 ? (
        <p className="text-sm text-gray-500">
          No categories yet — add some from the admin dashboard.
        </p>
      ) : (
        <div className="ns-stagger grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      )}
    </div>
  );
}
