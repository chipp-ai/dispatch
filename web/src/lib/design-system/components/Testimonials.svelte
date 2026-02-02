<script context="module" lang="ts">
  export interface Testimonial {
    name: string;
    role: string;
    content: string;
    image: string;
  }
</script>

<script lang="ts">
  import Avatar from "./Avatar.svelte";
  import Card from "./Card.svelte";
  import ScrollArea from "./ScrollArea.svelte";

  // Whitelabel: Accept testimonials as prop, default to Chipp testimonials
  export let testimonials: Testimonial[] | null = null;

  // Default Chipp testimonials (used when not whitelabeled)
  const defaultTestimonials: Testimonial[] = [
    {
      name: "Rob Wellen",
      role: "GAIP.ai",
      content:
        "We were able to start a company, go to market, get feedback and paying customers within 5 months because of Chipp.",
      image: "/assets/rob-wellen.jpg",
    },
    {
      name: "Tyler Hansen",
      role: "Directory of Technology",
      content:
        "We built the Hydronic Quote Helper to drastically reduce the time spent creating material lists for hydronic heating projects. It saves our team an average of 1.5 hours daily, or 30 hours a month.",
      image: "/assets/tyler-hansen.jpg",
    },
    {
      name: "Rhys Cassidy",
      role: "Senior Education Advisor",
      content:
        "It's literally so easy to build AI apps on Chipp. I build an app on the plane back from Brisbane to Melbourne and another on the ferry back to work.",
      image: "/assets/rhys-cassidy.jpg",
    },
    {
      name: "Megan Beltekoglu",
      role: "SheBuildsSolutions.com",
      content:
        "I made a podcast to blog assistant built on Chipp that took a four hour process and cut it in half.",
      image: "/assets/she-builds-solutions.jpg",
    },
    {
      name: "Emily Chen",
      role: "UX Designer",
      content:
        "I am more than happy to recommend Chipp.ai to colleagues and friends. It's user-friendly and easy-to-use interface makes it a top pick in my AI tool list.",
      image:
        "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
    {
      name: "Lisa Wang",
      role: "Marketing Specialist",
      content:
        "Chipp.ai has revolutionized the way I create AI products. The platform's ease of use is unparalleled, with an intuitive interface that allows me to navigate the world of AI easily.",
      image:
        "https://images.unsplash.com/photo-1517841905240-472988babdf9?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
    },
  ];

  // Use provided testimonials or default to Chipp's
  $: displayTestimonials = testimonials ?? defaultTestimonials;

  // Check if we have any testimonials to display
  $: hasTestimonials = displayTestimonials && displayTestimonials.length > 0;

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  }
</script>

{#if hasTestimonials}
  <ScrollArea class="testimonials-scroll">
    <div class="testimonials-container">
      {#each displayTestimonials as testimonial}
        <Card padding="md" class="testimonial-card">
          <div class="testimonial-header">
            <Avatar src={testimonial.image} alt={testimonial.name} size="lg">
              {getInitials(testimonial.name)}
            </Avatar>
            <div class="testimonial-info">
              <h3>{testimonial.name}</h3>
              <p>{testimonial.role}</p>
            </div>
          </div>
          <div class="testimonial-content">
            <p>{testimonial.content}</p>
          </div>
        </Card>
      {/each}
    </div>
  </ScrollArea>
{/if}

<style>
  :global(.testimonials-scroll) {
    height: 100vh;
    width: 100%;
    padding-top: var(--space-4);
  }

  .testimonials-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: 0 var(--space-4);
  }

  :global(.testimonial-card) {
    background-color: var(--bg-primary) !important;
    border: none !important;
  }

  .testimonial-header {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
  }

  .testimonial-info h3 {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: var(--text-primary);
    margin: 0;
  }

  .testimonial-info p {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin: 0;
  }

  .testimonial-content p {
    font-size: var(--text-base);
    color: var(--text-primary);
    line-height: 1.6;
    margin: 0;
  }
</style>
