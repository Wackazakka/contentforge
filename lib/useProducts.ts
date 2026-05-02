import { useState, useEffect } from 'react'
import { getSupabase } from './supabaseClient'
import { useAuth } from './authContext'

export interface Product {
  id: string
  organization_id: string
  name: string
  description: string | null
  category: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface CreateProductInput {
  name: string
  description?: string
  category?: string
}

export function useProducts(organizationId: string | null) {
  const { session } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch products for organization
  useEffect(() => {
    if (!organizationId || !session?.user?.id) return

    const fetchProducts = async () => {
      setLoading(true)
      setError(null)

      try {
        const supabase = getSupabase()
        const { data, error: queryError } = await supabase
          .from('products')
          .select('*')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })

        if (queryError) throw queryError

        setProducts(data || [])
      } catch (err) {
        console.error('[useProducts] Fetch error:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch products')
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [organizationId, session?.user?.id])

  // Create product
  const createProduct = async (input: CreateProductInput): Promise<Product | null> => {
    if (!organizationId || !session?.user?.id) {
      setError('Missing organization or user ID')
      return null
    }

    try {
      const supabase = getSupabase()
      const { data, error: insertError } = await supabase
        .from('products')
        .insert({
          organization_id: organizationId,
          name: input.name,
          description: input.description || null,
          category: input.category || null,
          created_by: session.user.id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Add to local state
      if (data) {
        setProducts((prev) => [data, ...prev])
      }

      return data || null
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create product'
      console.error('[useProducts] Create error:', err)
      setError(errorMsg)
      return null
    }
  }

  // Delete product
  const deleteProduct = async (productId: string): Promise<boolean> => {
    try {
      const supabase = getSupabase()
      const { error: deleteError } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)

      if (deleteError) throw deleteError

      // Remove from local state
      setProducts((prev) => prev.filter((p) => p.id !== productId))
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to delete product'
      console.error('[useProducts] Delete error:', err)
      setError(errorMsg)
      return false
    }
  }

  return {
    products,
    loading,
    error,
    createProduct,
    deleteProduct,
  }
}
