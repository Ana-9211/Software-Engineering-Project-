import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { catalogApi } from '../../api/endpoints.js';
import { useFetch } from '../../components/useFetch.js';
import { Async } from '../../components/states.jsx';
import BookCard from '../../components/BookCard.jsx';
import Pagination from '../../components/Pagination.jsx';
import { minorToInput, toMinorUnits } from '../../utils/format.js';

const SORTS = [
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['rating_desc', 'Rating'],
];

// S-01 Catalog: browse, search, filter and sort (UC-01, UC-02, FR-04, FR-05, FR-06)
export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) || '';
  const page = Math.max(1, Number(get('page')) || 1);

  const [search, setSearch] = useState(get('q'));
  const [minPrice, setMinPrice] = useState(get('minPrice') ? minorToInput(Number(get('minPrice'))) : '');
  const [maxPrice, setMaxPrice] = useState(get('maxPrice') ? minorToInput(Number(get('maxPrice'))) : '');
  const [priceError, setPriceError] = useState('');
  useEffect(() => setSearch(get('q')), [params.get('q')]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useFetch(() => catalogApi.categories(), []);
  const query = {
    q: get('q'),
    category: get('category'),
    minPrice: get('minPrice'),
    maxPrice: get('maxPrice'),
    minRating: get('minRating'),
    language: get('language'),
    sort: get('sort') || 'newest',
    page,
  };
  const books = useFetch(() => catalogApi.books(query), [params.toString()]);

  function update(changes) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v === undefined || v === null) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  }

  function submitSearch(e) {
    e.preventDefault();
    update({ q: search.trim() });
  }

  function applyPrice(e) {
    e.preventDefault();
    const lo = minPrice === '' ? '' : toMinorUnits(minPrice);
    const hi = maxPrice === '' ? '' : toMinorUnits(maxPrice);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return setPriceError('Enter prices like 150 or 149.99.');
    if (lo !== '' && hi !== '' && lo > hi) return setPriceError('The lowest price must not be above the highest price.');
    setPriceError('');
    return update({ minPrice: lo, maxPrice: hi });
  }

  function clearAll() {
    setSearch('');
    setMinPrice('');
    setMaxPrice('');
    setPriceError('');
    setParams(new URLSearchParams());
  }

  return (
    <section>
      <h1>Books</h1>
      <form className="search-bar" role="search" onSubmit={submitSearch}>
        <label htmlFor="q" className="sr-only">Search by title, author or ISBN</label>
        <input id="q" type="search" placeholder="Search by title, author or ISBN" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} />
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      <div className="catalog-layout">
        <aside className="filters" aria-label="Filters">
          <h2>Filters</h2>
          <div className="field">
            <label htmlFor="sort">Sort by</label>
            <select id="sort" value={query.sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <select id="category" value={query.category} onChange={(e) => update({ category: e.target.value })}>
              <option value="">All categories</option>
              {(categories.data || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="minRating">Minimum rating</label>
            <select id="minRating" value={query.minRating} onChange={(e) => update({ minRating: e.target.value })}>
              <option value="">Any rating</option>
              {[4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars and up</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="language">Language</label>
            <input id="language" value={get('language')} onChange={(e) => update({ language: e.target.value })} placeholder="e.g. English" maxLength={30} />
          </div>
          <form onSubmit={applyPrice} noValidate>
            <fieldset>
              <legend>Price range</legend>
              <div className="row">
                <div className="field">
                  <label htmlFor="minPrice">From</label>
                  <input id="minPrice" inputMode="decimal" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="maxPrice">To</label>
                  <input id="maxPrice" inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                </div>
              </div>
              {priceError && <small className="field-error" role="alert">{priceError}</small>}
              <button type="submit" className="btn btn-small">Apply price</button>
            </fieldset>
          </form>
          <button type="button" className="btn btn-small" onClick={clearAll}>Clear all filters</button>
        </aside>

        <div>
          <Async state={books} empty={{ test: (d) => d.items.length === 0, title: 'No books match your search.', children: <button type="button" className="btn" onClick={clearAll}>Clear filters</button> }}>
            {(d) => (
              <>
                <p className="muted" aria-live="polite">{d.totalItems} {d.totalItems === 1 ? 'book' : 'books'} found</p>
                <div className="book-grid">{d.items.map((b) => <BookCard key={b.id} book={b} />)}</div>
                <Pagination page={d.page} totalPages={d.totalPages} onChange={(p) => update({ page: p })} />
              </>
            )}
          </Async>
        </div>
      </div>
    </section>
  );
}
