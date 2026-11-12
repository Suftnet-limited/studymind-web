/** The learner's module page is wider (three columns: Recent list, tool, side card); the header and footer follow it so their edges line up. */
export const isWideRoute = (pathname: string | null) => !!pathname && /^\/my-learning\/modules\/[^/]+/.test(pathname);
