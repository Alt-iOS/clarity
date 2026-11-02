defmodule Clarity.Pages.PageLiveDiagramContainerTest do
  # Adds a content provider to the application's environment.
  use Clarity.Test.ConnCase, async: false

  alias Clarity.Content
  alias Clarity.Test.StaticGraphContent

  # A diagram's container is ignored by LiveView's patches (phx-update="ignore")
  # but for its data attributes. Were Graph Navigation's container the same
  # element as a static graph tab's, a live navigation from one to the other
  # would keep the other's classes: in Graph Navigation, a container as high
  # as its padding, its graph fitted to a sliver.

  setup do
    providers = Application.get_env(:clarity, :clarity_content_providers)
    Application.put_env(:clarity, :clarity_content_providers, providers ++ [StaticGraphContent])
    on_exit(fn -> Application.put_env(:clarity, :clarity_content_providers, providers) end)
  end

  @static_tab "/clarity/architect/application:clarity/#{Content.content_id(StaticGraphContent)}"

  # The classes of the element the Graphviz hook draws in.
  @spec graph_container_classes(Phoenix.LiveViewTest.View.t()) :: [String.t()]
  defp graph_container_classes(view) do
    view
    |> render()
    |> LazyHTML.from_fragment()
    |> LazyHTML.query("pre[phx-hook=Viz]")
    |> LazyHTML.attribute("class")
  end

  test "switching from a static graph tab to the Graph lens draws in Graph Navigation's container",
       %{conn: conn} do
    {:ok, view, _html} = live(conn, @static_tab)
    render_async(view)
    assert ["content p-4"] = graph_container_classes(view)

    view |> element("#activity-lens-graph") |> render_click()
    render_async(view)

    assert has_element?(view, "nav.tabs", "Graph Navigation")
    assert ["h-full"] = graph_container_classes(view)
  end

  # As the browser's back button does, from Graph Navigation to the tab before.
  test "patching from the Graph lens to a static graph tab draws in that tab's container",
       %{conn: conn} do
    {:ok, view, _html} = live(conn, "/clarity/graph/application:clarity/graph")
    render_async(view)
    assert ["h-full"] = graph_container_classes(view)

    render_patch(view, @static_tab)
    render_async(view)

    assert has_element?(view, "nav.tabs", "Static Graph")
    assert ["content p-4"] = graph_container_classes(view)
  end
end
