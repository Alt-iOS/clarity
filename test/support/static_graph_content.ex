defmodule Clarity.Test.StaticGraphContent do
  @moduledoc false

  # A tab that draws a fixed Graphviz graph, as a library's diagram tab does
  # (ash_diagram's, say), shown for applications.

  @behaviour Clarity.Content

  @impl Clarity.Content
  def name, do: "Static Graph"

  @impl Clarity.Content
  def description, do: "A fixed Graphviz graph"

  @impl Clarity.Content
  def applies?(%Clarity.Vertex.Application{}, _lens), do: true
  def applies?(_vertex, _lens), do: false

  @impl Clarity.Content
  def render_static(_vertex, _lens), do: {:viz, ~s(digraph { "a" -> "b" })}
end
