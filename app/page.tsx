import { redirect } from "next/navigation";

/**
 * The unit-side root used to render a four-button "borrow / return / member /
 * book" launcher. After the PLG split those flows live under the public
 * `/o/{slug}` entry and the unit-side root is now just a doorway into the
 * admin backend.
 */
export default function HomePage(): never {
  redirect("/admin");
}
